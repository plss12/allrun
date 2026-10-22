import { useImage } from '@shopify/react-native-skia';
import {
  launchImageLibraryAsync,
  UIImagePickerPreferredAssetRepresentationMode,
} from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
// TODO(SDK 58): import usePreventRemove from 'expo-router', which exports it from SDK 58 on. In
// SDK 57 it already ships, and the native stack honours it, but only under this internal path.
import { usePreventRemove } from 'expo-router/build/react-navigation/core';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { z } from 'zod';

import { availableActivityCharts } from '@/core/activity-charts';
import { customRange } from '@/core/dates';
import {
  defaultActivityTemplate,
  defaultSummaryTemplate,
  designFont,
  newLayer,
} from '@/core/default-layout';
import {
  canRestore,
  type DefaultTemplate,
  editLayers,
  type EditorLayers,
  INITIAL_FORMAT,
  layoutTemplate,
  setLayerTransform,
} from '@/core/editor-document';
import { canRedo, canUndo, commit, createHistory, redo, undo } from '@/core/history';
import {
  activityCatalog,
  catalogItemKey,
  type NewLayer,
  summaryCatalog,
} from '@/core/layer-catalog';
import { DEFAULT_FRAMING, type PhotoFraming } from '@/core/photo-framing';
import { bucketForPeriod } from '@/core/periods';
import { startOf } from '@/core/place';
import { SPORT_FAMILIES } from '@/core/sports';
import { selectActivities, summarize } from '@/core/summary';
import { type CanvasFormat, CANVAS_FORMATS, type Layer, type Template } from '@/core/template';
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
import { useUserTemplates } from '@/data/user-templates';
import { EditorCanvas } from '@/editor/editor-canvas';
import { ExportBar } from '@/editor/export-bar';
import { loadPhoto } from '@/editor/export-image';
import type { ExportDesign } from '@/editor/export-scene';
import { lookUpPlace, type PlaceLookup, UNKNOWN_PLACE } from '@/data/place-lookup';
import type { EditorData } from '@/editor/editor-data';
import type { LayerContext } from '@/editor/template-scene';
import { type TextOrigin, TypingOverlay } from '@/editor/typing-overlay';
import { useEditorFonts } from '@/editor/fonts';
import { FormatPicker } from '@/editor/format-picker';
import { LayerSheet } from '@/editor/layer-sheet';
import type { PickedPhoto } from '@/editor/photo-plan';
import { preparePhoto } from '@/editor/prepare-photo';
import { QuickActions } from '@/editor/quick-actions';
import { SelectionBar } from '@/editor/selection-bar';
import { STYLE_PANEL_HEIGHT, StylePanel } from '@/editor/style-panel';
import { TemplateSheet } from '@/editor/template-sheet';
import { useExport } from '@/editor/use-export';
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
      .pipe(z.array(z.enum(SPORT_FAMILIES))),
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

const MAIN_BUTTON_HEIGHT = 50;
/** Room under the controls, above the home indicator. */
const CONTROLS_BOTTOM = 32;

/**
 * Height of the controls under the canvas: a row of tiles (the formats, the quick actions or the
 * selected layer's actions) or the style panel, and the main buttons. It never changes, so
 * neither does the canvas, whichever step the editor is in.
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
      // The charts' data comes along; without it the editor still works, just without charts.
      const [activity, detail, zones] = await Promise.all([
        source.getActivity(params.activityId),
        source.getActivityDetail(params.activityId).catch((error: unknown) => {
          logError('Could not load the activity detail for its charts', error);
          return null;
        }),
        // Without them the heart rate chart just has no zones.
        source.getHeartRateZones().catch((error: unknown) => {
          logError('Could not load the heart rate zones', error);
          return null;
        }),
      ]);
      if (activity === null) {
        throw new ActivityNotFoundError(`No activity with id ${params.activityId}`);
      }
      // Its place is named once the editor is open: it doesn't hold up the loading.
      return { mode: 'activity', activity, detail, place: null, zones };
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
  data: loaded,
  fonts,
}: {
  readonly data: EditorData;
  readonly fonts: NonNullable<ReturnType<typeof useEditorFonts>>;
}) {
  const { t } = useTranslation();
  const { unit, locale } = useDisplaySettings();
  /**
   * Where the activity was done, for its place widget: named in the background, without asking
   * for anything; on Android, where naming it needs the location permission, it is asked for only
   * when the user picks the widget (`askedPlace`).
   */
  const lookedUpPlace = useAsync(
    () =>
      loaded.mode === 'activity'
        ? lookUpPlace(startOf(loaded.activity), false)
        : Promise.resolve(UNKNOWN_PLACE),
    loaded.mode === 'activity' ? loaded.activity.id : 'summary',
  );
  const [askedPlace, setAskedPlace] = useState<PlaceLookup | null>(null);
  const placeLookup =
    askedPlace ?? (lookedUpPlace.status === 'success' ? lookedUpPlace.data : UNKNOWN_PLACE);
  const data: EditorData =
    loaded.mode === 'activity' && placeLookup.status === 'known'
      ? { ...loaded, place: placeLookup.place }
      : loaded;
  const defaultTemplate: DefaultTemplate = (format) =>
    data.mode === 'activity'
      ? defaultActivityTemplate(data.activity, format)
      : defaultSummaryTemplate(data.summary, format);
  /**
   * The editor works in two steps on the same canvas: first the photo (optional: without one the
   * image is transparent), its format and framing (the layers show but can't be touched), then
   * the design, where the photo can still be framed
   * but neither replaced nor given another format. Laying out widgets in one format and then
   * switching to a very different one would pile them up.
   */
  const [step, setStep] = useState<'photo' | 'design'>('photo');
  // The format and the photo framing come first and stay out of the history: undo and Start
  // over only change the widgets (see `EditorLayers`).
  const [format, setFormat] = useState<CanvasFormat>(INITIAL_FORMAT);
  const [framing, setFraming] = useState<PhotoFraming>(DEFAULT_FRAMING);
  const [history, setHistory] = useState(() => createHistory<EditorLayers>(null));
  const template = layoutTemplate(defaultTemplate, format, history.present);
  /** Applies an edit of the widgets as one undo step (none when it changes nothing). */
  const edit = (change: (template: Template) => Template) =>
    setHistory((current) =>
      commit(
        current,
        editLayers(
          current.present,
          layoutTemplate(defaultTemplate, format, current.present),
          change,
        ),
      ),
    );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Undo can take away the selected layer; then nothing is selected.
  const selected = template.layers.find((layer) => layer.id === selectedId) ?? null;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const userTemplates = useUserTemplates();
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
    textContext: {
      unit,
      locale,
      durationUnits: {
        hours: t('durationUnits.hours'),
        minutes: t('durationUnits.minutes'),
        seconds: t('durationUnits.seconds'),
      },
      unitLabel: (metricUnit) => t(`metricUnits.${metricUnit}`),
    },
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
    data.mode === 'activity'
      ? activityCatalog(
          data.activity,
          data.detail === null ? [] : availableActivityCharts(data.detail, unit),
          placeLookup.status !== 'unknown',
          data.zones !== null,
        )
      : summaryCatalog(data.summary, data.bucketSize);
  const [photo, setPhoto] = useState<EditorPhoto | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const [nextPhotoId, setNextPhotoId] = useState(1);
  /** The full-quality copy being prepared in the background, to wait for it when exporting. */
  const pendingExportCopy = useRef<{ id: number; uri: Promise<string> } | null>(null);
  /**
   * Exporting replaces the design controls with what to do with the image; the canvas, frozen
   * meanwhile, shows exactly what is exported.
   */
  const exporter = useExport();
  const exporting = exporter.state.status !== 'idle';
  const startExport = () =>
    exporter.start(async (): Promise<ExportDesign> => ({
      template,
      layerContext,
      framing,
      photo: photo === null ? null : await loadPhoto(await exportCopyOf(photo)),
    }));

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
      const exportCopy = preparePhoto(picked, 'export');
      pendingExportCopy.current = { id, uri: exportCopy };
      updatePhoto(id, { exportUri: await exportCopy });
    } catch (error) {
      // The editor keeps working; exporting will retry the full-quality copy.
      logError('Could not prepare the export copy of the photo', error);
    }
  };

  /**
   * The full-quality copy of `current` for exporting: the one ready, else the one being prepared
   * (waited for), else a new one if that failed or hasn't started.
   */
  const exportCopyOf = async (current: EditorPhoto): Promise<string> => {
    if (current.exportUri !== null) {
      return current.exportUri;
    }
    const pending = pendingExportCopy.current;
    if (pending?.id === current.id) {
      try {
        return await pending.uri;
      } catch (error) {
        logError('Retrying the export copy of the photo', error);
      }
    }
    return preparePhoto(current.picked, 'export');
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
    // The place needs the permission first (Android): asked now, the widget is added once named.
    if (
      item.kind === 'info' &&
      item.field === 'activityPlace' &&
      placeLookup.status === 'needsPermission' &&
      data.mode === 'activity'
    ) {
      void lookUpPlace(startOf(data.activity), true).then((result) => {
        setAskedPlace(result);
        if (result.status === 'known') {
          addLayerNow(item);
        } else {
          Alert.alert(t('editor.placeUnavailable'));
        }
      });
      return;
    }
    addLayerNow(item);
  };
  const addLayerNow = (item: Exclude<NewLayer, { kind: 'text' }>) => {
    const id = uniqueLayerId(template, catalogItemKey(item));
    edit((current) =>
      addLayer(current, newLayer(item, id, current.format, designFont(current.layers))),
    );
    setSelectedId(id);
    setSheetOpen(false);
  };

  /**
   * Replaces the widgets with a template's (`null`: the default design) as one undo step, and
   * closes the sheet.
   */
  const chooseTemplate = (layers: EditorLayers) => {
    setHistory((current) => commit(current, layers));
    setSelectedId(null);
    setTemplatesOpen(false);
  };

  /** Opens the keyboard to type a text. */
  const startTyping = (draft: TextDraft) => {
    setStyling(false);
    setTextDraft(draft);
  };

  /** Opens the keyboard for a new text. */
  const addText = () =>
    startTyping({ layerId: uniqueLayerId(template, 'text'), isNew: true, content: '' });

  /** Commits the typed text (a blank one adds nothing, or removes the text) and selects it. */
  const finishTyping = () => {
    if (textDraft === null) {
      return;
    }
    edit((current) => commitTextDraft(current, textDraft));
    setSelectedId(textDraft.content.trim() === '' ? null : textDraft.layerId);
    setTextDraft(null);
  };

  const duplicateSelected = (id: string) => {
    const copyId = uniqueLayerId(template, id);
    edit((current) => duplicateLayer(current, id, copyId));
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
        // Framings are proportions of one photo and mean nothing for another: center the new one.
        setFraming(DEFAULT_FRAMING);
        void preparePhotoCopies(id, picked, false);
      }
    } catch (error) {
      logError('Could not open the photo library', error);
      setPhotoError(true);
    }
  };

  /**
   * Picks another format. A new format starts a new design, with an empty history: undoing into
   * layers laid out for the old format would pile them up. Losing the user's own layers asks
   * first.
   */
  const chooseFormat = (next: CanvasFormat) => {
    if (next === format) {
      return;
    }
    const change = () => {
      setFormat(next);
      setHistory(createHistory<EditorLayers>(null));
    };
    if (history.present === null) {
      change();
      return;
    }
    Alert.alert(t('editor.formatChangeTitle'), t('editor.formatChangeMessage'), [
      { text: t('editor.cancel'), style: 'cancel' },
      { text: t('editor.formatChangeConfirm'), onPress: change },
    ]);
  };

  /** Back to the photo and format; the design stays as it is until the format changes. */
  const backToPhoto = () => {
    setSelectedId(null);
    setStyling(false);
    setSheetOpen(false);
    setTemplatesOpen(false);
    setStep('photo');
  };

  // While designing, going back (the header's back button, Android's back) returns to the photo
  // step instead of leaving the editor; exporting is left and the text being typed is committed
  // first. The iOS swipe
  // back is off then: react-native-screens lets UIKit pop the screen and pushes it back after,
  // which flashes the previous screen.
  usePreventRemove(step === 'design', () => {
    if (exporting) {
      exporter.stop();
    } else if (typing) {
      finishTyping();
    } else {
      backToPhoto();
    }
  });

  /** Back to no photo: the design goes on transparent, as a sticker; the widgets stay. */
  const removePhoto = () => {
    setPhoto(null);
    setPhotoError(false);
    setFraming(DEFAULT_FRAMING);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.systemBackground }}>
      <Stack.Screen
        options={{
          title: t(step === 'photo' ? 'editor.photoStep' : 'editor.designStep'),
          gestureEnabled: step === 'photo',
          // Keeps the native back button next to the left toolbar instead of replaced by it.
          headerBackVisible: true,
        }}
      />
      {step === 'photo' && photo !== null ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="trash"
            accessibilityLabel={t('editor.removePhoto')}
            onPress={removePhoto}
          >
            {t('editor.removePhoto')}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}
      {step === 'design' ? (
        <>
          {/* Two buttons on each side, so the title has room in the middle (UIKit only centers it
              when it fits between the wider side and its mirror). Restoring sits apart from undo;
              nothing is edited while typing, since the draft isn't in the history yet. */}
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button
              icon="arrow.counterclockwise"
              accessibilityLabel={t('editor.restore')}
              disabled={typing || exporting || !canRestore(history.present)}
              onPress={() => setHistory((current) => commit(current, null))}
            >
              {t('editor.restore')}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button
              icon="arrow.uturn.backward"
              accessibilityLabel={t('editor.undo')}
              disabled={typing || exporting || !canUndo(history)}
              onPress={() => setHistory(undo)}
            >
              {t('editor.undo')}
            </Stack.Toolbar.Button>
            <Stack.Toolbar.Button
              icon="arrow.uturn.forward"
              accessibilityLabel={t('editor.redo')}
              disabled={typing || exporting || !canRedo(history)}
              onPress={() => setHistory(redo)}
            >
              {t('editor.redo')}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        </>
      ) : null}
      <LayerSheet
        visible={sheetOpen}
        catalog={catalog}
        format={template.format}
        font={designFont(template.layers)}
        layerContext={
          // Until the user allows naming the place, the gallery shows it with a sample name.
          placeLookup.status === 'needsPermission' && data.mode === 'activity'
            ? {
                ...layerContext,
                data: {
                  ...data,
                  place: {
                    city: t('gallery.placeSample.city'),
                    region: t('gallery.placeSample.region'),
                    country: t('gallery.placeSample.country'),
                  },
                },
              }
            : layerContext
        }
        onAdd={addNewLayer}
        onAddText={addText}
        onClose={() => setSheetOpen(false)}
      />
      <TemplateSheet
        visible={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        data={data}
        format={format}
        design={template}
        layerContext={layerContext}
        photo={canvasImage}
        framing={framing}
        userTemplates={userTemplates}
        onChoose={chooseTemplate}
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
            pointerEvents={exporting ? 'none' : 'auto'}
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
              layersLocked={step === 'photo'}
              selectedId={typing ? null : selectedId}
              onSelect={setSelectedId}
              onFramingChange={setFraming}
              onLayerTransform={(id, transform) =>
                edit((current) => setLayerTransform(current, id, transform))
              }
              onLayerRemove={(id) => edit((current) => removeLayer(current, id))}
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
          <StylePanel layer={styled} locale={locale} onChange={edit} />
        ) : (
          <View style={{ height: STYLE_PANEL_HEIGHT, justifyContent: 'center' }}>
            {step === 'photo' ? (
              <FormatPicker format={format} onPick={chooseFormat} />
            ) : exporting ? (
              <ExportBar state={exporter.state} onRetry={startExport} />
            ) : selected !== null ? (
              <SelectionBar
                onEditText={
                  selected.kind === 'text' ? () => startTyping(editTextDraft(selected)) : undefined
                }
                onStyle={() => setStyling(true)}
                onDuplicate={() => duplicateSelected(selected.id)}
                onBringToFront={() => edit((current) => moveLayer(current, selected.id, 'front'))}
                onSendToBack={() => edit((current) => moveLayer(current, selected.id, 'back'))}
                onRemove={() => {
                  edit((current) => removeLayer(current, selected.id));
                  setSelectedId(null);
                }}
                canDuplicate={canAddLayer(template)}
                canBringToFront={canMoveLayer(template, selected.id, 'front')}
                canSendToBack={canMoveLayer(template, selected.id, 'back')}
              />
            ) : (
              <QuickActions
                onAddLayer={() => setSheetOpen(true)}
                onAddText={addText}
                onTemplates={() => setTemplatesOpen(true)}
                canAdd={canAddLayer(template)}
              />
            )}
          </View>
        )}
        <View style={{ height: MAIN_BUTTON_HEIGHT, flexDirection: 'row', gap: 12 }}>
          {step === 'photo' ? (
            // Without a photo the design can go on too: it exports transparent, as a sticker.
            // The button most people want next stands out.
            <>
              <MainButton
                label={photo === null ? t('editor.choosePhoto') : t('editor.changePhoto')}
                onPress={pickPhoto}
                secondary={photo !== null}
              />
              <MainButton
                label={t('editor.next')}
                onPress={() => setStep('design')}
                secondary={photo === null}
              />
            </>
          ) : selected !== null ? (
            // "Done" goes one step back: from the style panel to the layer's actions, then from
            // those to no selection.
            <MainButton
              label={t('editor.done')}
              onPress={styled !== null ? () => setStyling(false) : () => setSelectedId(null)}
            />
          ) : exporting ? (
            <MainButton label={t('editor.done')} onPress={exporter.stop} secondary />
          ) : (
            <MainButton label={t('editor.export')} onPress={startExport} />
          )}
        </View>
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

/** A wide button under the controls; side by side, they share the row equally. */
function MainButton({
  label,
  onPress,
  secondary = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: secondary ? colors.secondarySystemBackground : colors.tint,
        borderRadius: 14,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        maxFontSizeMultiplier={1.3}
        style={{ color: secondary ? colors.label : colors.onTint, fontSize: 17, fontWeight: '700' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
