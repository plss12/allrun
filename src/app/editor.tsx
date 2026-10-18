import { useImage } from '@shopify/react-native-skia';
import {
  launchImageLibraryAsync,
  UIImagePickerPreferredAssetRepresentationMode,
} from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { z } from 'zod';

import { customRange } from '@/core/dates';
import { defaultActivityTemplate, defaultSummaryTemplate, newLayer } from '@/core/default-layout';
import {
  canRestore,
  createDocument,
  type DefaultTemplate,
  editLayers,
  type EditorDocument,
  INITIAL_FORMAT,
  resetFraming,
  restoreDocument,
  sameDocument,
  setFormat,
  setFraming,
  setLayerTransform,
} from '@/core/editor-document';
import { canRedo, canUndo, commit, createHistory, mapHistory, redo, undo } from '@/core/history';
import {
  activityCatalog,
  catalogItemKey,
  type NewLayer,
  summaryCatalog,
} from '@/core/layer-catalog';
import { DEFAULT_FRAMING } from '@/core/photo-framing';
import { bucketForPeriod } from '@/core/periods';
import { selectActivities, summarize } from '@/core/summary';
import { type CanvasFormat, CANVAS_FORMATS, type Layer } from '@/core/template';
import {
  addLayer,
  canAddLayer,
  canMoveLayer,
  duplicateLayer,
  moveLayer,
  removeLayer,
  uniqueLayerId,
} from '@/core/template-edit';
import {
  commitTextDraft,
  editTextDraft,
  previewTextDraft,
  type TextDraft,
} from '@/core/text-draft';
import { useActivitySource } from '@/data/activity-source';
import { EditorCanvas } from '@/editor/editor-canvas';
import type { EditorData } from '@/editor/editor-data';
import type { LayerContext } from '@/editor/template-scene';
import { type TextOrigin, TypingOverlay } from '@/editor/typing-overlay';
import { useEditorFonts } from '@/editor/fonts';
import { LayerSheet } from '@/editor/layer-sheet';
import type { PickedPhoto } from '@/editor/photo-plan';
import { preparePhoto } from '@/editor/prepare-photo';
import { SelectionBar } from '@/editor/selection-bar';
import { STYLE_PANEL_HEIGHT, StylePanel } from '@/editor/style-panel';
import { colors } from '@/theme/colors';
import { logError } from '@/ui/log';
import { useDisplaySettings } from '@/ui/settings';
import { ErrorView, LoadingView } from '@/ui/state-views';
import { useAsync } from '@/ui/use-async';

/** Route params, validated: they can come from a deep link, not only from our own screens. */
const paramsSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('activity'), activityId: z.string().min(1) }),
  z.object({
    mode: z.literal('summary'),
    kind: z.enum(['week', 'month', 'year', 'custom']),
    start: z.iso.date(),
    end: z.iso.date(),
    families: z
      .string()
      .transform((value) => (value === '' ? [] : value.split(',')))
      .pipe(z.array(z.enum(['run', 'ride', 'swim', 'training', 'other']))),
  }),
]);

class ActivityNotFoundError extends Error {}

/** The chosen photo and its two copies (see `photo-plan.ts`). */
interface EditorPhoto {
  /** Increases with every pick, so a slow preparation of a replaced photo is ignored. */
  readonly id: number;
  readonly picked: PickedPhoto;
  /** Editor copy Skia draws on screen; `null` while it is being prepared. */
  readonly editorUri: string | null;
  /** Whether the editor copy was re-encoded (a failed decode of the original retries once). */
  readonly editorReencoded: boolean;
  /** Full-quality copy for exporting; `null` until prepared in the background. */
  readonly exportUri: string | null;
}

/** Formats from tallest to widest, in one row: each button shows its shape and proportions. */
const FORMATS: readonly CanvasFormat[] = ['story', 'tall', 'portrait', 'square', 'landscape'];
/** The format buttons fit in the space of the style panel, which replaces them. */
const FORMAT_HEIGHT = 72;
/** Longest side of the shape drawn on each format button. */
const FORMAT_SHAPE = 28;

/** Size of a format's shape on its button: its proportions, with the longer side fixed. */
function formatShape(format: CanvasFormat): { width: number; height: number } {
  const { width, height } = CANVAS_FORMATS[format];
  return width >= height
    ? { width: FORMAT_SHAPE, height: (FORMAT_SHAPE * height) / width }
    : { width: (FORMAT_SHAPE * width) / height, height: FORMAT_SHAPE };
}

const MAIN_BUTTON_HEIGHT = 50;
/** Room under the controls, above the home indicator. */
const CONTROLS_BOTTOM = 32;

/**
 * Height of the controls under the canvas: the formats (or the style panel) and the main button
 * ("Change photo", or "Done" while styling). It never changes, so neither does the canvas.
 */
const CONTROLS_HEIGHT = STYLE_PANEL_HEIGHT + 12 + MAIN_BUTTON_HEIGHT + CONTROLS_BOTTOM;

export default function Editor() {
  const { t } = useTranslation();
  const params = paramsSchema.safeParse(useLocalSearchParams());
  const paramsError = params.success ? null : z.prettifyError(params.error);
  useEffect(() => {
    if (paramsError !== null) {
      logError('Invalid editor route params', paramsError);
    }
  }, [paramsError]);
  if (!params.success) {
    return <ErrorView message={t('editor.error')} />;
  }
  return <EditorScreen params={params.data} />;
}

function EditorScreen({ params }: { readonly params: z.infer<typeof paramsSchema> }) {
  const { t } = useTranslation();
  const source = useActivitySource();
  const fonts = useEditorFonts();
  const data = useAsync(async (): Promise<EditorData> => {
    if (params.mode === 'activity') {
      const activity = await source.getActivity(params.activityId);
      if (activity === null) {
        throw new ActivityNotFoundError(`No activity with id ${params.activityId}`);
      }
      return { mode: 'activity', activity };
    }
    const range = customRange(params.start, params.end);
    const activities = await source.listInRange(range);
    const filter = params.families.length === 0 ? {} : { families: params.families };
    const selected = selectActivities(activities, range, filter);
    return {
      mode: 'summary',
      kind: params.kind,
      summary: summarize(selected, range),
      activities: selected,
      bucketSize: bucketForPeriod(params.kind, range),
    };
  }, JSON.stringify(params));

  if (data.status === 'loading' || fonts === null) {
    return <LoadingView />;
  }
  if (data.status === 'error') {
    return data.error instanceof ActivityNotFoundError ? (
      <ErrorView message={t('editor.notFound')} />
    ) : (
      <ErrorView message={t('editor.error')} onRetry={data.retry} />
    );
  }
  return <EditorWorkspace data={data.data} fonts={fonts} />;
}

function EditorWorkspace({
  data,
  fonts,
}: {
  readonly data: EditorData;
  readonly fonts: NonNullable<ReturnType<typeof useEditorFonts>>;
}) {
  const { t } = useTranslation();
  const { unit, locale } = useDisplaySettings();
  const defaultTemplate: DefaultTemplate = (format) =>
    data.mode === 'activity'
      ? defaultActivityTemplate(data.activity, format)
      : defaultSummaryTemplate(data.summary, format);
  const [history, setHistory] = useState(() =>
    createHistory(createDocument(defaultTemplate, INITIAL_FORMAT, DEFAULT_FRAMING)),
  );
  const { template, framing } = history.present;
  /** Applies an edit as one undo step (none when it changes nothing). */
  const edit = (change: (document: EditorDocument) => EditorDocument) =>
    setHistory((current) => commit(current, change(current.present)));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Undo can take away the selected layer; then nothing is selected.
  const selected = template.layers.find((layer) => layer.id === selectedId) ?? null;
  const [sheetOpen, setSheetOpen] = useState(false);
  /**
   * Whether the style panel replaces the bottom controls. It closes when nothing is selected; a
   * tap on another layer switches the panel to it.
   */
  const [styling, setStyling] = useState(false);
  const styled = styling ? selected : null;
  if (styling && styled === null) {
    setStyling(false);
  }
  /** Free text being typed, committed as one undo step on "Done". */
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const typing = textDraft !== null;
  const layerContext: LayerContext = {
    data,
    fonts,
    textContext: { unit, locale },
    translate: (key, values) => t(key, values),
  };
  // While typing, the text leaves the canvas for the typing overlay, which shows it as typed.
  const shownTemplate =
    textDraft === null
      ? template
      : {
          ...template,
          layers: template.layers.filter((layer) => layer.id !== textDraft.layerId),
        };
  const typedLayer =
    textDraft === null
      ? undefined
      : previewTextDraft(template, textDraft).layers.find(
          (layer) => layer.id === textDraft.layerId,
        );
  const catalog =
    data.mode === 'activity' ? activityCatalog(data.activity) : summaryCatalog(data.summary);
  const [photo, setPhoto] = useState<EditorPhoto | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const [nextPhotoId, setNextPhotoId] = useState(1);

  /** Applies a change only if `id` is still the current photo. */
  const updatePhoto = (id: number, change: Partial<EditorPhoto>) =>
    setPhoto((current) => (current?.id === id ? { ...current, ...change } : current));

  const failPhoto = (id: number, context: string, error: unknown) => {
    logError(context, error);
    setPhoto((current) => (current?.id === id ? null : current));
    setPhotoError(true);
  };

  /**
   * Prepares the editor copy first (fast, so the photo appears quickly), then the full-quality
   * export copy in the background while the user edits.
   */
  const preparePhotoCopies = async (id: number, picked: PickedPhoto, forceEditor: boolean) => {
    try {
      const editorUri = await preparePhoto(picked, 'editor', forceEditor);
      updatePhoto(id, { editorUri, editorReencoded: forceEditor });
    } catch (error) {
      failPhoto(id, 'Could not prepare the editor copy of the photo', error);
      return;
    }
    try {
      updatePhoto(id, { exportUri: await preparePhoto(picked, 'export') });
    } catch (error) {
      // The editor keeps working; exporting will retry the full-quality copy.
      logError('Could not prepare the export copy of the photo', error);
    }
  };

  const canvasImage = useImage(photo?.editorUri, (error) => {
    if (photo === null) {
      return;
    }
    if (!photo.editorReencoded) {
      // Skia could not decode the file as picked: re-encode it once and try again.
      logError('Could not decode the photo, re-encoding it', error);
      updatePhoto(photo.id, { editorUri: null });
      void preparePhotoCopies(photo.id, photo.picked, true);
    } else {
      failPhoto(photo.id, 'Could not decode the re-encoded photo', error);
    }
  });

  /** Adds a widget on top of the others and selects it, ready to be dragged into place. */
  const addNewLayer = (item: Exclude<NewLayer, { kind: 'text' }>) => {
    const id = uniqueLayerId(template, catalogItemKey(item));
    edit((document) =>
      editLayers(document, (current) => addLayer(current, newLayer(item, id, current.format))),
    );
    setSelectedId(id);
    setSheetOpen(false);
  };

  /** Opens the keyboard to type a text. */
  const startTyping = (draft: TextDraft) => {
    setStyling(false);
    setTextDraft(draft);
  };

  /** Commits the typed text (a blank one adds nothing, or removes the text) and selects it. */
  const finishTyping = () => {
    if (textDraft === null) {
      return;
    }
    edit((document) => editLayers(document, (current) => commitTextDraft(current, textDraft)));
    setSelectedId(textDraft.content.trim() === '' ? null : textDraft.layerId);
    setTextDraft(null);
  };

  const duplicateSelected = (id: string) => {
    const copyId = uniqueLayerId(template, id);
    edit((document) => editLayers(document, (current) => duplicateLayer(current, id, copyId)));
    setSelectedId(copyId);
  };

  const size = CANVAS_FORMATS[template.format];
  const displayWidth =
    area === null ? 0 : Math.min(area.width, (area.height * size.width) / size.height);
  const displayHeight = (displayWidth * size.height) / size.width;

  /**
   * Where a layer is on screen, in the editor's coordinates: the canvas is centered in its area,
   * inside a 16 pt padding.
   */
  const originOf = (layer: Layer): TextOrigin => {
    const ratio = displayWidth / size.width;
    const left = 16 + ((area?.width ?? 0) - displayWidth) / 2;
    const top = 16 + ((area?.height ?? 0) - displayHeight) / 2;
    return {
      x: left + layer.transform.x * displayWidth,
      y: top + layer.transform.y * displayHeight,
      scale: ratio * layer.transform.scale,
      rotation: layer.transform.rotation,
    };
  };

  const pickPhoto = async () => {
    setPhotoError(false);
    try {
      const result = await launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        // Keep the original file (HEIC included); preparePhoto re-encodes it once if needed,
        // instead of the picker transcoding every photo.
        preferredAssetRepresentationMode: UIImagePickerPreferredAssetRepresentationMode.Current,
      });
      if (!result.canceled && result.assets.length > 0) {
        const picked = result.assets[0];
        const id = nextPhotoId;
        setNextPhotoId(id + 1);
        setPhoto({ id, picked, editorUri: null, editorReencoded: false, exportUri: null });
        // Changing the photo can't be undone: the framing of the old one goes away entirely.
        setHistory((current) => mapHistory(current, resetFraming, sameDocument));
        void preparePhotoCopies(id, picked, false);
      }
    } catch (error) {
      logError('Could not open the photo library', error);
      setPhotoError(true);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.systemBackground }}>
      {/* Restoring first, far from adding; nothing is edited while typing, since the draft isn't
          in the history yet. */}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="arrow.counterclockwise"
          accessibilityLabel={t('editor.restore')}
          disabled={typing || !canRestore(history.present)}
          onPress={() => edit((document) => restoreDocument(document, defaultTemplate))}
        >
          {t('editor.restore')}
        </Stack.Toolbar.Button>
        <Stack.Toolbar.Button
          icon="arrow.uturn.backward"
          accessibilityLabel={t('editor.undo')}
          disabled={typing || !canUndo(history)}
          onPress={() => setHistory(undo)}
        >
          {t('editor.undo')}
        </Stack.Toolbar.Button>
        <Stack.Toolbar.Button
          icon="arrow.uturn.forward"
          accessibilityLabel={t('editor.redo')}
          disabled={typing || !canRedo(history)}
          onPress={() => setHistory(redo)}
        >
          {t('editor.redo')}
        </Stack.Toolbar.Button>
        <Stack.Toolbar.Button
          icon="plus"
          accessibilityLabel={t('editor.addLayer')}
          disabled={typing || !canAddLayer(template)}
          onPress={() => setSheetOpen(true)}
        >
          {t('editor.addLayer')}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <LayerSheet
        visible={sheetOpen}
        catalog={catalog}
        onAdd={addNewLayer}
        onAddText={() =>
          startTyping({ layerId: uniqueLayerId(template, 'text'), isNew: true, content: '' })
        }
        onClose={() => setSheetOpen(false)}
      />
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setArea({ width: width - 32, height: height - 32 });
        }}
      >
        {displayWidth > 0 ? (
          <View
            style={{
              borderRadius: 12,
              borderCurve: 'continuous',
              overflow: 'hidden',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
            }}
          >
            <EditorCanvas
              displayWidth={displayWidth}
              template={shownTemplate}
              layerContext={layerContext}
              photo={canvasImage}
              framing={framing}
              selectedId={typing ? null : selectedId}
              onSelect={setSelectedId}
              onFramingChange={(next) => edit((document) => setFraming(document, next))}
              onLayerTransform={(id, transform) =>
                edit((document) => setLayerTransform(document, id, transform))
              }
              onLayerRemove={(id) =>
                edit((document) => editLayers(document, (current) => removeLayer(current, id)))
              }
              trashLabel={t('editor.removeLayer')}
            />
            {photo !== null && canvasImage === null ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ActivityIndicator
                  size="large"
                  color="#FFFFFF"
                  accessibilityLabel={t('editor.loadingPhoto')}
                />
              </View>
            ) : null}
            {photoError ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 12,
                  right: 12,
                  bottom: 12,
                  padding: 10,
                  borderRadius: 10,
                  borderCurve: 'continuous',
                  backgroundColor: 'rgba(0, 0, 0, 0.75)',
                }}
              >
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={{ color: '#FFFFFF', fontSize: 14, textAlign: 'center' }}
                >
                  {t('editor.photoError')}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <View
        style={{
          height: CONTROLS_HEIGHT,
          gap: 12,
          paddingHorizontal: 16,
          paddingBottom: CONTROLS_BOTTOM,
        }}
      >
        {styled !== null ? (
          <StylePanel
            layer={styled}
            summary={data.mode === 'summary' ? data.summary : null}
            autoBucket={data.mode === 'summary' ? data.bucketSize : null}
            locale={locale}
            onChange={(change) => edit((document) => editLayers(document, change))}
          />
        ) : (
          // The selection bar covers the formats instead of pushing them, so the canvas keeps its
          // size when a layer gets selected.
          <View style={{ height: STYLE_PANEL_HEIGHT, justifyContent: 'center' }}>
            <View
              style={{ flexDirection: 'row', gap: 8, opacity: selected === null ? 1 : 0 }}
              pointerEvents={selected === null ? 'auto' : 'none'}
              accessibilityElementsHidden={selected !== null}
              importantForAccessibility={selected === null ? 'auto' : 'no-hide-descendants'}
              accessibilityRole="tablist"
              accessibilityLabel={t('editor.format')}
            >
              {FORMATS.map((option) => {
                const chosen = template.format === option;
                const ink = chosen ? colors.onTint : colors.label;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="tab"
                    accessibilityLabel={t(`formats.${option}`)}
                    accessibilityState={{ selected: chosen }}
                    hitSlop={4}
                    onPress={() => edit((document) => setFormat(document, option, defaultTemplate))}
                    style={({ pressed }) => ({
                      flex: 1,
                      height: FORMAT_HEIGHT,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      backgroundColor: chosen ? colors.tint : colors.secondarySystemBackground,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <View
                      style={{
                        height: FORMAT_SHAPE,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <View
                        style={{
                          ...formatShape(option),
                          borderWidth: 2,
                          borderRadius: 4,
                          borderColor: ink,
                        }}
                      />
                    </View>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      maxFontSizeMultiplier={1.3}
                      style={{
                        color: ink,
                        fontSize: 13,
                        fontWeight: '600',
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {t(`formatRatios.${option}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {selected === null ? null : (
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  justifyContent: 'center',
                }}
              >
                <SelectionBar
                  onEditText={
                    selected.kind === 'text'
                      ? () => startTyping(editTextDraft(selected))
                      : undefined
                  }
                  onStyle={() => setStyling(true)}
                  onDuplicate={() => duplicateSelected(selected.id)}
                  onBringToFront={() =>
                    edit((document) =>
                      editLayers(document, (current) => moveLayer(current, selected.id, 'front')),
                    )
                  }
                  onSendToBack={() =>
                    edit((document) =>
                      editLayers(document, (current) => moveLayer(current, selected.id, 'back')),
                    )
                  }
                  onRemove={() => {
                    edit((document) =>
                      editLayers(document, (current) => removeLayer(current, selected.id)),
                    );
                    setSelectedId(null);
                  }}
                  canDuplicate={canAddLayer(template)}
                  canBringToFront={canMoveLayer(template, selected.id, 'front')}
                  canSendToBack={canMoveLayer(template, selected.id, 'back')}
                />
              </View>
            )}
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          // With a layer selected it reads "Done", one step back: from the style panel to the
          // layer's actions, then from those to no selection.
          onPress={
            styled !== null
              ? () => setStyling(false)
              : selected !== null
                ? () => setSelectedId(null)
                : pickPhoto
          }
          style={({ pressed }) => ({
            height: MAIN_BUTTON_HEIGHT,
            backgroundColor: colors.tint,
            borderRadius: 14,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ color: colors.onTint, fontSize: 17, fontWeight: '700' }}
          >
            {selected !== null
              ? t('editor.done')
              : photo === null
                ? t('editor.choosePhoto')
                : t('editor.changePhoto')}
          </Text>
        </Pressable>
      </View>
      {textDraft === null || typedLayer?.kind !== 'text' ? null : (
        <TypingOverlay
          layer={typedLayer}
          origin={originOf(typedLayer)}
          onChangeText={(content) => setTextDraft({ ...textDraft, content })}
          onDone={finishTyping}
        />
      )}
    </View>
  );
}
