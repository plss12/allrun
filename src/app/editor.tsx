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
  createDocument,
  type DefaultTemplate,
  editLayers,
  type EditorDocument,
  resetFraming,
  resetLayout,
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
import { bucketize, summarize } from '@/core/summary';
import { type CanvasFormat, CANVAS_FORMATS } from '@/core/template';
import {
  addLayer,
  canAddLayer,
  canMoveLayer,
  duplicateLayer,
  moveLayer,
  removeLayer,
  setTextContent,
  uniqueLayerId,
} from '@/core/template-edit';
import { useActivitySource } from '@/data/activity-source';
import { EditorCanvas } from '@/editor/editor-canvas';
import type { EditorData } from '@/editor/editor-data';
import { useEditorFonts } from '@/editor/fonts';
import { LayerSheet, type LayerSheetRequest } from '@/editor/layer-sheet';
import type { PickedPhoto } from '@/editor/photo-plan';
import { preparePhoto } from '@/editor/prepare-photo';
import { SelectionBar } from '@/editor/selection-bar';
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
      .pipe(z.array(z.enum(['run', 'ride', 'swim', 'other']))),
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

const FORMATS: readonly CanvasFormat[] = ['story', 'tall', 'portrait', 'square', 'landscape'];

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
    const bucketSize = bucketForPeriod(params.kind, range);
    return {
      mode: 'summary',
      kind: params.kind,
      summary: summarize(activities, range, filter),
      buckets: bucketize(activities, range, bucketSize, filter),
      bucketSize,
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
      : defaultSummaryTemplate(bucketForPeriod(data.kind, data.summary.range), format);
  const [history, setHistory] = useState(() =>
    createHistory(createDocument(defaultTemplate, 'story', DEFAULT_FRAMING)),
  );
  const { template, framing } = history.present;
  /** Applies an edit as one undo step (none when it changes nothing). */
  const edit = (change: (document: EditorDocument) => EditorDocument) =>
    setHistory((current) => commit(current, change(current.present)));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Undo can take away the selected layer; then nothing is selected.
  const selected = template.layers.find((layer) => layer.id === selectedId) ?? null;
  const [sheet, setSheet] = useState<LayerSheetRequest | null>(null);
  const catalog =
    data.mode === 'activity'
      ? activityCatalog(data.activity)
      : summaryCatalog(data.summary, data.bucketSize);
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
  const addNewLayer = (item: NewLayer) => {
    const id = uniqueLayerId(template, catalogItemKey(item));
    edit((document) =>
      editLayers(document, (current) => addLayer(current, newLayer(item, id, current.format))),
    );
    setSelectedId(id);
    setSheet(null);
  };

  const duplicateSelected = (id: string) => {
    const copyId = uniqueLayerId(template, id);
    edit((document) => editLayers(document, (current) => duplicateLayer(current, id, copyId)));
    setSelectedId(copyId);
  };

  const size = CANVAS_FORMATS[template.format];
  const displayWidth =
    area === null ? 0 : Math.min(area.width, (area.height * size.width) / size.height);

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
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="arrow.uturn.backward"
          accessibilityLabel={t('editor.undo')}
          disabled={!canUndo(history)}
          onPress={() => setHistory(undo)}
        >
          {t('editor.undo')}
        </Stack.Toolbar.Button>
        <Stack.Toolbar.Button
          icon="arrow.uturn.forward"
          accessibilityLabel={t('editor.redo')}
          disabled={!canRedo(history)}
          onPress={() => setHistory(redo)}
        >
          {t('editor.redo')}
        </Stack.Toolbar.Button>
        <Stack.Toolbar.Button
          icon="plus"
          accessibilityLabel={t('editor.addLayer')}
          disabled={!canAddLayer(template)}
          onPress={() => setSheet({ kind: 'add' })}
        >
          {t('editor.addLayer')}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <LayerSheet
        request={sheet}
        catalog={catalog}
        onAdd={addNewLayer}
        onEditText={(id, content) => {
          edit((document) =>
            editLayers(document, (current) => setTextContent(current, id, content)),
          );
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
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
              template={template}
              layerContext={{
                data,
                fonts,
                textContext: { unit, locale },
                translate: (key) => t(key),
              }}
              photo={canvasImage}
              framing={framing}
              selectedId={selectedId}
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
          </View>
        ) : null}
      </View>

      <View style={{ gap: 12, paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8 }}>
        {photoError ? (
          <Text
            accessibilityRole="alert"
            style={{ color: colors.error, fontSize: 13, textAlign: 'center' }}
          >
            {t('editor.photoError')}
          </Text>
        ) : null}
        {/* The selection bar covers the formats instead of pushing them, so the canvas keeps its
            size when a layer gets selected. */}
        <View style={{ minHeight: 56, justifyContent: 'center' }}>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              justifyContent: 'center',
              opacity: selected === null ? 1 : 0,
            }}
            pointerEvents={selected === null ? 'auto' : 'none'}
            accessibilityElementsHidden={selected !== null}
            importantForAccessibility={selected === null ? 'auto' : 'no-hide-descendants'}
            accessibilityRole="tablist"
            accessibilityLabel={t('editor.format')}
          >
            {FORMATS.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="tab"
                accessibilityState={{ selected: template.format === option }}
                onPress={() => edit((document) => setFormat(document, option, defaultTemplate))}
                style={({ pressed }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor:
                    template.format === option ? colors.tint : colors.secondarySystemBackground,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  style={{
                    color: template.format === option ? colors.onTint : colors.label,
                    fontSize: 14,
                    fontWeight: '600',
                  }}
                >
                  {t(`formats.${option}`)}
                </Text>
              </Pressable>
            ))}
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
                    ? () =>
                        setSheet({
                          kind: 'editText',
                          layerId: selected.id,
                          content: selected.content,
                        })
                    : undefined
                }
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
        {history.present.customLayout ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => edit((document) => resetLayout(document, defaultTemplate))}
            style={({ pressed }) => ({ alignSelf: 'center', opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ color: colors.tint, fontSize: 15, fontWeight: '600' }}>
              {t('editor.restoreLayout')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={pickPhoto}
          style={({ pressed }) => ({
            backgroundColor: colors.tint,
            borderRadius: 14,
            borderCurve: 'continuous',
            padding: 14,
            alignItems: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: colors.onTint, fontSize: 17, fontWeight: '700' }}>
            {photo === null ? t('editor.choosePhoto') : t('editor.changePhoto')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
