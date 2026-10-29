import { useImage } from '@shopify/react-native-skia';
import {
  launchImageLibraryAsync,
  UIImagePickerPreferredAssetRepresentationMode,
} from 'expo-image-picker';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { sportIcon } from '@/core/activity-block';
import { availableActivityCharts } from '@/core/activity-charts';
import { customRange } from '@/core/dates';
import {
  defaultActivityTemplate,
  defaultSummaryTemplate,
  designFont,
  newLayer,
} from '@/core/default-layout';
import {
  canStartOver,
  type DefaultTemplate,
  editLayers,
  type EditorDesign,
  type EditorLayers,
  INITIAL_DESIGN,
  layoutTemplate,
  setFormat,
  setFraming,
  setLayers,
  setLayerTransform,
  startOver,
} from '@/core/editor-document';
import { canRedo, canUndo, commit, createHistory, redo, undo } from '@/core/history';
import {
  activityCatalog,
  catalogItemKey,
  type NewLayer,
  summaryCatalog,
} from '@/core/layer-catalog';
import { DEFAULT_FRAMING } from '@/core/photo-framing';
import { bucketForPeriod, isCurrentPeriod } from '@/core/periods';
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
import { ActionTile } from '@/editor/action-tile';
import { EditorCanvas } from '@/editor/editor-canvas';
import { EditorSideMenu } from '@/editor/editor-side-menu';
import { EditorTopBar, TOP_BAR_GAP } from '@/editor/editor-top-bar';
import { ExportBar } from '@/editor/export-bar';
import { loadPhoto } from '@/editor/export-image';
import type { ExportDesign } from '@/editor/export-scene';
import { lookUpPlace, type PlaceLookup, UNKNOWN_PLACE } from '@/data/place-lookup';
import type { EditorData } from '@/editor/editor-data';
import type { LayerContext } from '@/editor/template-scene';
import { type TextOrigin, TypingOverlay } from '@/editor/typing-overlay';
import { useEditorFonts } from '@/editor/fonts';
import { LayerSheet } from '@/editor/layer-sheet';
import { Notice, useNotice } from '@/editor/notice';
import type { PickedPhoto } from '@/editor/photo-plan';
import { preparePhoto } from '@/editor/prepare-photo';
import {
  FLOATING_INK,
  KeptMounted,
  PillButton,
  ROUND_BUTTON_SIZE,
  RoundButton,
} from '@/editor/round-button';
import { SelectionBar } from '@/editor/selection-bar';
import { StylePanel } from '@/editor/style-panel';
import { TemplateSheet } from '@/editor/template-sheet';
import { useExport } from '@/editor/use-export';
import { floatingSurface } from '@/theme/card-surface';
import { colors } from '@/theme/colors';
import { logError } from '@/ui/log';
import { useDisplaySettings } from '@/ui/settings';
import { ErrorView, LoadingView } from '@/ui/state-views';
import { todayLocal } from '@/ui/today';
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

/** Room between the screen's safe area and the floating controls, in points. */
const EDGE = 12;
const MAIN_BUTTON_HEIGHT = 44;
/** Where the right column starts, under the top right buttons, from the safe area's top. */
const BELOW_TOP_BAR = EDGE + ROUND_BUTTON_SIZE + 12;
/** Where a dock on top starts: under the left column (close, undo, redo, Start over). */
const BELOW_LEFT_COLUMN = EDGE + 4 * ROUND_BUTTON_SIZE + 3 * TOP_BAR_GAP + 12;
/** The bottom row: "+", "Aa" and export. */
const BOTTOM_BUTTON_SIZE = 56;

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
      families: params.families,
      current: isCurrentPeriod(params.kind, range, todayLocal()),
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

/**
 * The editor, in one step and full screen (ADR 009): the canvas fills the screen and the controls
 * float over it. On top, close, undo, redo, Start over, adding an image, depth and export; on the
 * right, the design's menus (Collages, Designs, Ratio, Activity); at the bottom, "+" and "Aa".
 * A selected widget's actions, the photo's (a tap on it) and the export's float in a dock, at the
 * bottom or, for a widget in the lower half, at the top, so they never cover what they change.
 */
function EditorWorkspace({
  data: loaded,
  fonts,
}: {
  readonly data: EditorData;
  readonly fonts: NonNullable<ReturnType<typeof useEditorFonts>>;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const notice = useNotice();
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
  /** The whole design, format and framing included, one undo step per gesture or change. */
  const [history, setHistory] = useState(() => createHistory<EditorDesign>(INITIAL_DESIGN));
  const design = history.present;
  const template = layoutTemplate(defaultTemplate, design);
  /** Applies a change of the design as one undo step (none when it changes nothing). */
  const change = (next: (current: EditorDesign) => EditorDesign) =>
    setHistory((current) => commit(current, next(current.present)));
  /** Applies an edit of the widgets as one undo step. */
  const edit = (next: (template: Template) => Template) =>
    change((current) => editLayers(current, defaultTemplate, next));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Undo can take away the selected layer; then nothing is selected.
  const selected = template.layers.find((layer) => layer.id === selectedId) ?? null;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [formatsOpen, setFormatsOpen] = useState(false);
  /** Whether the photo's actions show, after a tap on it. */
  const [photoTools, setPhotoTools] = useState(false);
  /** A widget is being dragged: the controls step aside, as in a story editor. */
  const [dragging, setDragging] = useState(false);
  const userTemplates = useUserTemplates();
  /**
   * Whether the style panel replaces the selected layer's actions. It closes when nothing is
   * selected; a tap on another layer switches the panel to it.
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
          data.detail !== null && data.detail.laps.length > 1,
        )
      : summaryCatalog(data.summary, data.bucketSize);
  const [photo, setPhoto] = useState<EditorPhoto | null>(null);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const [nextPhotoId, setNextPhotoId] = useState(1);
  /** The full-quality copy being prepared in the background, to wait for it when exporting. */
  const pendingExportCopy = useRef<{ id: number; uri: Promise<string> } | null>(null);
  /**
   * Exporting replaces the controls with what to do with the image; the canvas, frozen meanwhile,
   * shows exactly what is exported.
   */
  const exporter = useExport();
  const exporting = exporter.state.status !== 'idle';
  const startExport = () => {
    setSelectedId(null);
    setPhotoTools(false);
    setFormatsOpen(false);
    exporter.start(async (): Promise<ExportDesign> => ({
      template,
      layerContext,
      framing: design.framing,
      photo: photo === null ? null : await loadPhoto(await exportCopyOf(photo)),
    }));
  };

  /** Says that a planned button's feature is on its way (ADR 009: every button shows already). */
  const comingSoon = () => notice.show(t('editor.comingSoon'));

  /** Applies a change only if `id` is still the current photo. */
  const updatePhoto = (id: number, change: Partial<EditorPhoto>) =>
    setPhoto((current) => (current?.id === id ? { ...current, ...change } : current));

  const failPhoto = (id: number, context: string, error: unknown) => {
    logError(context, error);
    setPhoto((current) => (current?.id === id ? null : current));
    notice.show(t('editor.photoError'));
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
      ((item.kind === 'info' && item.field === 'activityPlace') ||
        (item.kind === 'activityBlock' && item.block.design === 'location')) &&
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
    selectLayer(id);
    setSheetOpen(false);
  };

  /**
   * Replaces the widgets with a template's (`null`: the default design) as one undo step, and
   * closes the sheet.
   */
  const chooseTemplate = (layers: EditorLayers) => {
    change((current) => setLayers(current, layers));
    setSelectedId(null);
    setTemplatesOpen(false);
  };

  /** Another format, as one undo step: the widgets keep their relative places. */
  const chooseFormat = (format: CanvasFormat) => {
    change((current) => setFormat(current, format));
    setFormatsOpen(false);
  };

  /** Opens the keyboard to type a text. */
  const startTyping = (draft: TextDraft) => {
    setStyling(false);
    setPhotoTools(false);
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

  /** Selects a layer (`null`: none); the photo's actions give way to it. */
  const selectLayer = (id: string | null) => {
    setSelectedId(id);
    if (id !== null) {
      setPhotoTools(false);
    }
  };

  /** A tap on the photo first lets go of the selected widget; then it shows the photo's actions. */
  const tapPhoto = () => {
    if (selectedId !== null) {
      setSelectedId(null);
    } else if (photo !== null) {
      setPhotoTools((shown) => !shown);
    }
  };

  const size = CANVAS_FORMATS[template.format];
  const displayWidth =
    area === null ? 0 : Math.min(area.width, (area.height * size.width) / size.height);
  const displayHeight = (displayWidth * size.height) / size.width;
  // The canvas's top-left corner, from the safe area's top-left corner.
  const canvasLeft = ((area?.width ?? 0) - displayWidth) / 2;
  const canvasTop = ((area?.height ?? 0) - displayHeight) / 2;

  /** Where a layer is on screen, from the safe area's top-left corner. */
  const originOf = (layer: Layer): TextOrigin => ({
    x: canvasLeft + layer.transform.x * displayWidth,
    y: canvasTop + layer.transform.y * displayHeight,
    scale: (displayWidth / size.width) * layer.transform.scale,
    rotation: layer.transform.rotation,
  });

  const pickPhoto = async () => {
    setPhotoTools(false);
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
        change((current) => setFraming(current, DEFAULT_FRAMING));
        void preparePhotoCopies(id, picked, false);
      }
    } catch (error) {
      logError('Could not open the photo library', error);
      notice.show(t('editor.photoError'));
    }
  };

  /** Back to no photo: the design goes on transparent, as a sticker; the widgets stay. */
  const removePhoto = () => {
    setPhoto(null);
    setPhotoTools(false);
    change((current) => setFraming(current, DEFAULT_FRAMING));
  };

  // Leaving with a photo or edits asks first: the design is not kept. Going back while exporting
  // leaves the export, and while typing commits the text.
  const unsaved = photo !== null || canUndo(history);
  /**
   * Whether the user confirmed leaving: prevention stops and the blocked action is repeated
   * (expo-router's `repeat`; dispatching it again while still prevented did nothing).
   */
  const [leaving, setLeaving] = useState(false);
  usePreventRemove(!leaving && (unsaved || exporting || typing), ({ repeat }) => {
    if (exporting) {
      exporter.stop();
    } else if (typing) {
      finishTyping();
    } else {
      Alert.alert(t('editor.discardTitle'), t('editor.discardMessage'), [
        { text: t('editor.cancel'), style: 'cancel' },
        {
          text: t('editor.discard'),
          style: 'destructive',
          onPress: () => {
            setLeaving(true);
            repeat();
          },
        },
      ]);
    }
  });
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  /** What the dock shows, if anything: the export, the selected widget's tools, the photo's. */
  const dock: 'export' | 'style' | 'selection' | 'photo' | null = exporting
    ? 'export'
    : styled !== null
      ? 'style'
      : selected !== null
        ? 'selection'
        : photoTools && photo !== null
          ? 'photo'
          : null;
  // A widget in the lower half gets its tools on top, out of its way.
  const dockOnTop = selected !== null && selected.transform.y > 0.5 && !exporting;
  /** The controls step aside while a widget is dragged or a text is typed. */
  const controlsShown = !dragging && !typing;

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
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
        format={design.format}
        design={template}
        layerContext={layerContext}
        photo={canvasImage}
        framing={design.framing}
        userTemplates={userTemplates}
        onChoose={chooseTemplate}
      />
      <View
        style={{
          position: 'absolute',
          top: insets.top,
          bottom: insets.bottom,
          left: 0,
          right: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setArea({ width, height });
        }}
      >
        {displayWidth > 0 ? (
          <View
            pointerEvents={exporting ? 'none' : 'auto'}
            style={{ borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden' }}
          >
            <EditorCanvas
              displayWidth={displayWidth}
              template={shownTemplate}
              layerContext={layerContext}
              photo={canvasImage}
              framing={design.framing}
              selectedId={typing ? null : selectedId}
              onSelect={selectLayer}
              onTapPhoto={tapPhoto}
              onDraggingChange={setDragging}
              onFramingChange={(framing) => change((current) => setFraming(current, framing))}
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
            {photo === null && controlsShown && !exporting ? (
              <View
                pointerEvents="box-none"
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
                <ChoosePhotoButton onPress={() => void pickPhoto()} />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {formatsOpen ? (
        // A tap anywhere else closes the formats' panel, as with any menu.
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={() => setFormatsOpen(false)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
      {controlsShown && !exporting ? (
        <View style={{ position: 'absolute', top: insets.top + EDGE, left: EDGE }}>
          <EditorTopBar
            onClose={close}
            onUndo={() => setHistory(undo)}
            onRedo={() => setHistory(redo)}
            onStartOver={() => change(startOver)}
            canUndo={canUndo(history)}
            canRedo={canRedo(history)}
            canStartOver={canStartOver(design)}
          />
        </View>
      ) : null}
      {/* Hidden rather than unmounted, so it stays folded or open as the user left it and its
          sport's icon doesn't load again. */}
      <KeptMounted
        hidden={!controlsShown || dock !== null}
        style={{ position: 'absolute', top: insets.top + EDGE, right: EDGE }}
      >
        <EditorSideMenu
          onAddImage={comingSoon}
          onDepth={comingSoon}
          format={design.format}
          formatsOpen={formatsOpen}
          onFormatsOpenChange={setFormatsOpen}
          onPickFormat={chooseFormat}
          onCollages={comingSoon}
          onDesigns={() => {
            setFormatsOpen(false);
            setTemplatesOpen(true);
          }}
          onActivity={comingSoon}
          sport={data.mode === 'activity' ? sportIcon(data.activity) : null}
        />
      </KeptMounted>
      {controlsShown && dock === null ? (
        // What to add on the left; exporting, the step that finishes the image, on the right.
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            bottom: insets.bottom + EDGE,
            left: EDGE,
            right: EDGE,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <PillButton
              icon={{ ios: 'plus', android: 'add' }}
              label={t('editor.addLayer')}
              onPress={() => setSheetOpen(true)}
              disabled={!canAddLayer(template)}
              height={BOTTOM_BUTTON_SIZE}
              minWidth={96}
            />
            <RoundButton
              label={t('editor.addText')}
              onPress={addText}
              disabled={!canAddLayer(template)}
              size={BOTTOM_BUTTON_SIZE}
            >
              <Text
                importantForAccessibility="no"
                maxFontSizeMultiplier={1}
                style={{ color: FLOATING_INK, fontSize: 22, fontWeight: '700' }}
              >
                Aa
              </Text>
            </RoundButton>
          </View>
          <PillButton
            icon={{ ios: 'square.and.arrow.up', android: 'ios_share' }}
            label={t('editor.export')}
            showLabel
            onPress={startExport}
            accent
            height={BOTTOM_BUTTON_SIZE}
          />
        </View>
      ) : null}
      {controlsShown && dock !== null ? (
        <View
          style={{
            position: 'absolute',
            left: EDGE / 2,
            right: EDGE / 2,
            ...(dockOnTop
              ? { top: insets.top + BELOW_LEFT_COLUMN }
              : { bottom: insets.bottom + EDGE / 2 }),
          }}
        >
          <Dock
            onDone={
              dock === 'export'
                ? exporter.stop
                : dock === 'style'
                  ? () => setStyling(false)
                  : dock === 'selection'
                    ? () => setSelectedId(null)
                    : () => setPhotoTools(false)
            }
          >
            {dock === 'export' ? (
              <ExportBar state={exporter.state} onRetry={startExport} />
            ) : styled !== null ? (
              <StylePanel
                layer={styled}
                locale={locale}
                onChange={edit}
                layerContext={layerContext}
              />
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
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <ActionTile
                  icon={{ ios: 'photo.on.rectangle', android: 'photo_library' }}
                  label={t('editor.changePhoto')}
                  onPress={() => void pickPhoto()}
                />
                <ActionTile
                  icon={{ ios: 'trash', android: 'delete' }}
                  label={t('editor.removePhoto')}
                  onPress={removePhoto}
                  destructive
                />
              </View>
            )}
          </Dock>
        </View>
      ) : null}
      <Notice message={notice.message} top={insets.top + BELOW_TOP_BAR} />
      {textDraft === null || typedLayer?.kind !== 'text' ? null : (
        <View style={{ position: 'absolute', top: insets.top, left: 0, right: 0, bottom: 0 }}>
          <TypingOverlay
            layer={typedLayer}
            origin={originOf(typedLayer)}
            onChangeText={(content) => setTextDraft({ ...textDraft, content })}
            onDone={finishTyping}
          />
        </View>
      )}
    </View>
  );
}

/**
 * A floating panel over the canvas with a set of tools and "Done" under them, which goes one
 * step back (from the style panel to the widget's actions, from those to no selection).
 */
function Dock({ children, onDone }: { readonly children: ReactNode; readonly onDone: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ ...floatingSurface(24), padding: 10, gap: 10 }}>
      {children}
      <Pressable
        accessibilityRole="button"
        onPress={onDone}
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
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={{ color: colors.onTint, fontSize: 17, fontWeight: '700' }}
        >
          {t('editor.done')}
        </Text>
      </Pressable>
    </View>
  );
}

/** "Choose photo" in the middle of the empty canvas, over the checkerboard. */
function ChoosePhotoButton({ onPress }: { readonly onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: 24,
        backgroundColor: colors.tint,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <SymbolView
        name={{ ios: 'photo.on.rectangle', android: 'photo_library' }}
        size={20}
        tintColor={colors.onTint}
      />
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={{ color: colors.onTint, fontSize: 17, fontWeight: '700' }}
      >
        {t('editor.choosePhoto')}
      </Text>
    </Pressable>
  );
}
