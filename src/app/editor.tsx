import { type SkImage, useImage } from '@shopify/react-native-skia';
import {
  launchImageLibraryAsync,
  UIImagePickerPreferredAssetRepresentationMode,
} from 'expo-image-picker';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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
  applyDesign,
  INITIAL_DESIGN,
  layoutTemplate,
  setBackground,
  setFormat,
  setLayers,
  setLayerTransform,
  setPhotoPlacement,
  startOver,
} from '@/core/editor-document';
import { canRedo, canUndo, commit, createHistory, redo, undo } from '@/core/history';
import {
  activityCatalog,
  catalogItemKey,
  type NewLayer,
  summaryCatalog,
} from '@/core/layer-catalog';
import { backgroundColor } from '@/core/design-background';
import { LAYER_MARGIN, layerVerticalReach, liftToClear } from '@/core/layer-transform';
import { COVER_PLACEMENT, samePlacement, type Size } from '@/core/photo-placement';
import { bucketForPeriod, isCurrentPeriod } from '@/core/periods';
import { startOf } from '@/core/place';
import { SPORT_FAMILIES } from '@/core/sports';
import { selectActivities, summarize } from '@/core/summary';
import { type CanvasFormat, CANVAS_FORMATS, type Layer, type Template } from '@/core/template';
import {
  addLayer,
  canAddLayer,
  canMoveLayer,
  chosenWordsOf,
  duplicateLayer,
  moveLayer,
  removeLayer,
  setChosenWords,
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
import { BackgroundPicker } from '@/editor/background-picker';
import { EditorCanvas } from '@/editor/editor-canvas';
import { EditorSideMenu } from '@/editor/editor-side-menu';
import { EditorTopBar } from '@/editor/editor-top-bar';
import { ExportBar } from '@/editor/export-bar';
import { loadPhoto } from '@/editor/export-image';
import type { ExportDesign } from '@/editor/export-scene';
import { lookUpPlace, type PlaceLookup, UNKNOWN_PLACE } from '@/data/place-lookup';
import type { EditorData } from '@/editor/editor-data';
import type { LayerContext } from '@/editor/template-scene';
import { type TextOrigin, TypingOverlay } from '@/editor/typing-overlay';
import { useEditorFonts } from '@/editor/fonts';
import { ChoiceSheet } from '@/editor/choice-list';
import { LayerSheet } from '@/editor/layer-sheet';
import { Notice, useNotice } from '@/editor/notice';
import { photoDominantColor } from '@/editor/photo-color';
import type { PickedPhoto } from '@/editor/photo-plan';
import { preparePhoto } from '@/editor/prepare-photo';
import {
  FLOATING_INK,
  KeptMounted,
  PillButton,
  ROUND_BUTTON_SIZE,
  RoundButton,
} from '@/editor/round-button';
import { StylePanel, widgetTools } from '@/editor/style-panel';
import { TemplateSheet } from '@/editor/template-sheet';
import { useExport } from '@/editor/use-export';
import { type ColumnTool, WidgetColumn } from '@/editor/widget-column';
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
/** The room left between a widget being edited and the panel of its options, in points. */
const PANEL_GAP = 16;
/** How the canvas rises over the panel of a widget's options, and settles back. */
const LIFT_TIMING = {
  duration: 250,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
} as const;
/** The bottom row: the photo, "+", "Aa" and export. */
const BOTTOM_BUTTON_SIZE = 52;
/**
 * "+", the main thing to do, stands out by being wider, never taller: every button of the row is
 * as tall as the others.
 */
const ADD_BUTTON_WIDTH = 84;

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
  /**
   * The whole design, format, photo placement and background included, one undo step per gesture
   * or change.
   */
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
   * The widget column's tool open (its size slider, or a panel of its options) and its "…" menu.
   * They close when nothing is selected; a tap on another widget switches the tool to it.
   */
  const [tool, setTool] = useState<ColumnTool | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  if (selected === null && (tool !== null || moreOpen)) {
    setTool(null);
    setMoreOpen(false);
  }
  /** The widget whose options show in the dock, and which, if its tool applies to it. */
  const styled =
    selected !== null &&
    (tool === 'color' || (tool === 'lettering' && widgetTools(selected).lettering !== null))
      ? { layer: selected, tool }
      : null;
  /** The selected widget's content size, before scaling, as the canvas measures it. */
  const [selectedSize, setSelectedSize] = useState<Size | null>(null);
  /** The dock's height, as laid out: where its top edge is. */
  const [dockHeight, setDockHeight] = useState(0);
  /** The selected widget's scale while the size slider is dragged, drawn by the canvas. */
  const liveScale = useSharedValue(1);
  const [resizing, setResizing] = useState(false);
  /** The widget whose verse, quote or phrase is being chosen again from its list. */
  const [choosingId, setChoosingId] = useState<string | null>(null);
  const choosing = template.layers.find((layer) => layer.id === choosingId);
  const choosingWords = choosing === undefined ? null : chosenWordsOf(choosing);
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
      photo: photo === null ? null : await loadPhoto(await exportCopyOf(photo)),
      dominant,
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

  /**
   * The photo's dominant color, the `auto` background: read once per photo from the editor copy
   * (a reduced copy of it, see `photo-color.ts`), and used for the export too, so both match.
   */
  const dominant = canvasImage === null ? null : readDominant(canvasImage);

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
   * Applies a design of the user's (its widgets, photo placement and background) or AllRun's
   * widgets (`null`: the default design), as one undo step, and closes the sheet.
   */
  const chooseTemplate = (
    choice:
      | { readonly kind: 'design'; readonly template: Template }
      | { readonly kind: 'layers'; readonly layers: EditorLayers },
  ) => {
    change((current) =>
      choice.kind === 'design'
        ? applyDesign(current, choice.template)
        : setLayers(current, choice.layers),
    );
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
    setTool(null);
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

  /**
   * Rewrites a free text, or opens the list of a verse, a quote or a chat message's phrase to
   * choose other words; `undefined` for the other widgets.
   */
  const editLayerOf = (layer: Layer): (() => void) | undefined => {
    if (layer.kind === 'text') {
      return () => startTyping(editTextDraft(layer));
    }
    return chosenWordsOf(layer) === null ? undefined : () => setChoosingId(layer.id);
  };

  /** A tap on the selected widget edits it as its Edit button does, as in a story editor. */
  const tapSelected = (id: string) => {
    const layer = template.layers.find((candidate) => candidate.id === id);
    if (layer !== undefined) {
      editLayerOf(layer)?.();
    }
  };

  const duplicateSelected = (id: string) => {
    const copyId = uniqueLayerId(template, id);
    edit((current) => duplicateLayer(current, id, copyId));
    setSelectedId(copyId);
  };

  /** Selects a layer (`null`: none); the photo's actions and the "…" menu give way to it. */
  const selectLayer = (id: string | null) => {
    setSelectedId(id);
    setMoreOpen(false);
    if (id !== null) {
      setPhotoTools(false);
    }
  };

  /** Opens the photo's tools and the background (the bottom row's photo button). */
  const openPhotoTools = () => {
    setSelectedId(null);
    setFormatsOpen(false);
    setPhotoTools(true);
  };

  /**
   * A tap on the photo first lets go of the selected widget; then it shows the photo's tools and
   * the background, also without a photo (a sticker over a color).
   */
  const tapPhoto = () => {
    if (selectedId !== null) {
      setSelectedId(null);
    } else {
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
        // A new photo starts centered and covering the canvas (user's choice), as one undo step.
        change((current) => setPhotoPlacement(current, COVER_PLACEMENT));
        void preparePhotoCopies(id, picked, false);
      }
    } catch (error) {
      logError('Could not open the photo library', error);
      notice.show(t('editor.photoError'));
    }
  };

  /**
   * Back to no photo: the design goes on over its background (transparent by default, as a
   * sticker); the widgets stay.
   */
  const removePhoto = () => {
    setPhoto(null);
    setPhotoTools(false);
    change((current) => setPhotoPlacement(current, COVER_PLACEMENT));
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

  /**
   * What the dock shows, if anything: the export, the options of a tool of the widget column, the
   * photo's tools.
   */
  const dock: 'export' | 'style' | 'photo' | null = exporting
    ? 'export'
    : styled !== null
      ? 'style'
      : photoTools && selected === null
        ? 'photo'
        : null;
  // The panel of a widget's options is always at the bottom. If it would cover the widget, the
  // whole canvas rises just enough for the widget to show over it, on its own part of the photo
  // (judging a color or a backdrop against another part would mislead), and settles back when
  // the panel closes. Not an edit: the design doesn't change.
  const lift =
    dock === 'style' && selected !== null && selectedSize !== null && dockHeight > 0 && area
      ? (() => {
          const ratio = displayWidth / size.width;
          const reach = layerVerticalReach(selected.transform, selectedSize, size, LAYER_MARGIN);
          return liftToClear(
            { top: canvasTop + reach.top * ratio, bottom: canvasTop + reach.bottom * ratio },
            area.height - EDGE / 2 - dockHeight,
            PANEL_GAP,
          );
        })()
      : 0;
  const liftY = useSharedValue(0);
  useEffect(() => {
    liftY.set(withTiming(-lift, LIFT_TIMING));
  }, [lift, liftY]);
  const liftStyle = useAnimatedStyle(() => ({ transform: [{ translateY: liftY.get() }] }));
  /** The controls step aside while a widget is dragged or a text is typed. */
  const controlsShown = !dragging && !typing;

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <ChoiceSheet
        words={choosingWords}
        onChoose={(words) => {
          if (choosingId !== null) {
            edit((current) => setChosenWords(current, choosingId, words));
          }
          setChoosingId(null);
        }}
        onClose={() => setChoosingId(null)}
      />
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
        dominant={dominant}
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
          <Animated.View
            pointerEvents={exporting ? 'none' : 'auto'}
            style={[{ borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden' }, liftStyle]}
          >
            <EditorCanvas
              displayWidth={displayWidth}
              template={shownTemplate}
              layerContext={layerContext}
              photo={canvasImage}
              placement={design.photo}
              backdrop={backgroundColor(design.background, dominant)}
              selectedId={typing ? null : selectedId}
              resizing={resizing}
              liveScale={liveScale}
              onSelect={selectLayer}
              onTapSelected={tapSelected}
              onSelectedSizeChange={setSelectedSize}
              onTapPhoto={tapPhoto}
              onDraggingChange={setDragging}
              onPlacementChange={(placement) =>
                change((current) => setPhotoPlacement(current, placement))
              }
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
          </Animated.View>
        ) : null}
      </View>

      {formatsOpen || moreOpen ? (
        // A tap anywhere else closes the formats' panel or the "…" menu, as with any menu.
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={() => {
            setFormatsOpen(false);
            setMoreOpen(false);
          }}
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
          sport's icon doesn't load again. The selected widget's column takes its place. */}
      <KeptMounted
        hidden={!controlsShown || dock !== null || selected !== null}
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
      {controlsShown && !exporting && selected !== null ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: insets.top + EDGE, right: EDGE }}
        >
          <WidgetColumn
            layer={selected}
            tool={tool}
            onToolChange={setTool}
            moreOpen={moreOpen}
            onMoreOpenChange={setMoreOpen}
            actions={{
              onEdit: editLayerOf(selected),
              onDuplicate: () => duplicateSelected(selected.id),
              onBringToFront: () => edit((current) => moveLayer(current, selected.id, 'front')),
              onSendToBack: () => edit((current) => moveLayer(current, selected.id, 'back')),
              onRemove: () => {
                edit((current) => removeLayer(current, selected.id));
                setSelectedId(null);
              },
              canDuplicate: canAddLayer(template),
              canBringToFront: canMoveLayer(template, selected.id, 'front'),
              canSendToBack: canMoveLayer(template, selected.id, 'back'),
            }}
            liveScale={liveScale}
            onResizeStart={() => setResizing(true)}
            onResize={(scale) => {
              // The new size and the end of the live drawing in one update: no stale frame.
              edit((current) =>
                setLayerTransform(current, selected.id, { ...selected.transform, scale }),
              );
              setResizing(false);
            }}
          />
        </View>
      ) : null}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* The photo's tools, as a tap on it opens them; without a photo, the picker straight
                away (a tap on the empty canvas still opens the background). Here rather than over
                the canvas, where it kept widgets from being moved. */}
            <RoundButton
              icon={{ ios: 'photo.on.rectangle', android: 'photo_library' }}
              label={t(photo === null ? 'editor.choosePhoto' : 'editor.photoTools')}
              onPress={photo === null ? () => void pickPhoto() : openPhotoTools}
              size={BOTTOM_BUTTON_SIZE}
            />
            <PillButton
              icon={{ ios: 'plus', android: 'add' }}
              iconSize={28}
              label={t('editor.addLayer')}
              onPress={() => setSheetOpen(true)}
              disabled={!canAddLayer(template)}
              height={BOTTOM_BUTTON_SIZE}
              minWidth={ADD_BUTTON_WIDTH}
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
          onLayout={(event) => setDockHeight(event.nativeEvent.layout.height)}
          style={{
            position: 'absolute',
            left: EDGE / 2,
            right: EDGE / 2,
            bottom: insets.bottom + EDGE / 2,
          }}
        >
          <Dock
            onDone={
              dock === 'export'
                ? exporter.stop
                : dock === 'style'
                  ? () => setTool(null)
                  : () => setPhotoTools(false)
            }
          >
            {dock === 'export' ? (
              <ExportBar state={exporter.state} onRetry={startExport} />
            ) : styled !== null ? (
              <StylePanel
                layer={styled.layer}
                tool={styled.tool}
                locale={locale}
                onChange={edit}
                layerContext={layerContext}
              />
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <ActionTile
                    icon={{ ios: 'photo.on.rectangle', android: 'photo_library' }}
                    label={t(photo === null ? 'editor.choosePhoto' : 'editor.changePhoto')}
                    onPress={() => void pickPhoto()}
                  />
                  <ActionTile
                    icon={{ ios: 'arrow.up.left.and.arrow.down.right', android: 'fit_screen' }}
                    label={t('editor.fitPhoto')}
                    onPress={() => change((current) => setPhotoPlacement(current, COVER_PLACEMENT))}
                    disabled={photo === null || samePlacement(design.photo, COVER_PLACEMENT)}
                  />
                  <ActionTile
                    icon={{ ios: 'trash', android: 'delete' }}
                    label={t('editor.removePhoto')}
                    onPress={removePhoto}
                    disabled={photo === null}
                    destructive
                  />
                </View>
                <BackgroundPicker
                  background={design.background}
                  dominant={dominant}
                  onChange={(background) => change((current) => setBackground(current, background))}
                />
              </>
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
 * The photo's dominant color, or `null` (no auto background) when it can't be read. Read once per
 * image (see `photoDominantColor`), however often the editor renders.
 */
function readDominant(image: SkImage): string | null {
  try {
    return photoDominantColor(image);
  } catch (error) {
    logError("Could not read the photo's dominant color", error);
    return null;
  }
}

/**
 * A floating panel over the canvas with a set of tools and "Done" under them, which closes it
 * (the widget stays selected).
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
