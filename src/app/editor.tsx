import { type SkImage, useImage } from '@shopify/react-native-skia';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { NotificationFeedbackType, notificationAsync } from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { Spinner } from '@/ui/spinner';
import type { Activity } from '@/core/activity';
import { sportIcon } from '@/core/activity-block';
import {
  defaultActivityTemplate,
  defaultSummaryTemplate,
  designFont,
  emptyLayout,
  newLayer,
} from '@/core/default-layout';
import {
  canStartOver,
  designStart,
  type DefaultTemplate,
  editLayers,
  type EditorDesign,
  setCollageLayout,
  INITIAL_DESIGN,
  layoutTemplate,
  setBackground,
  setFormat,
  setLanguage,
  setLayerTransform,
  setCellPlacement,
  setFrame,
  setPhotoPlacement,
  setUnits,
  startOver,
} from '@/core/editor-document';
import { canRedo, canUndo, commit, createHistory, redo, undo, mapHistory } from '@/core/history';
import { catalogItemKey, type NewLayer } from '@/core/layer-catalog';
import { splitOpacity, withOpacity } from '@/core/color-menu';
import { cellAt, collageCells } from '@/core/collage';
import { backgroundColor } from '@/core/design-background';
import {
  LAYER_MARGIN,
  layerCoversCanvas,
  layerPoint,
  layerVerticalReach,
  liftToClear,
} from '@/core/layer-transform';
import { COVER_PLACEMENT, samePlacement, type Size } from '@/core/photo-placement';
import { namesPlace, startOf } from '@/core/place';
import { setLayerColor, setLayerOpacity } from '@/core/layer-style';
import {
  type CanvasFormat,
  CANVAS_FORMATS,
  type CollageLayout,
  type DesignBackground,
  type DesignLanguage,
  IMAGE_FRAMES,
  type Layer,
  type Template,
} from '@/core/template';
import {
  canAddImage,
  coversCanvas,
  fillsCanvas,
  EDITOR_PHOTO,
  imageCount,
  isEmptyWindow,
  layerPictures,
  mountWindows,
  windowAt,
  withoutPicture,
  isImageLayer,
  MAX_IMAGES,
  SAMPLE_IMAGE,
  SAMPLE_PICTURE,
  setLayerImage,
  usesEditorPhoto,
} from '@/core/image-layer';
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
import { pickedPhoto } from '@/data/photo-library';
import { usePhrases } from '@/data/phrases';
import type { DistanceUnit } from '@/core/units';
import { useUserTemplates } from '@/data/user-templates';
import { ActionTile } from '@/editor/action-tile';
import { galleryData } from '@/editor/gallery-place';
import { ColorMenu } from '@/editor/color-menu';
import { Eyedropper } from '@/editor/eyedropper';
import { snapshotDesign } from '@/editor/eyedropper-snapshot';
import { EditorCanvas } from '@/editor/editor-canvas';
import { DataSheet } from '@/editor/data-sheet';
import { photoToolLabels } from '@/editor/action-labels';
import {
  ACTION_TILE_GAP,
  actionLabelSize,
  ADD_BUTTON_WIDTH,
  BOTTOM_BUTTON_SIZE,
  BOTTOM_PAIR_GAP,
  DOCK_EDGE,
  EDGE,
} from '@/editor/editor-layout';
import { EditorSideMenu } from '@/editor/editor-side-menu';
import { EditorTopBar } from '@/editor/editor-top-bar';
import { alertNoPhotosPermission, ExportBar } from '@/editor/export-bar';
import { loadPhoto } from '@/editor/export-image';
import { type CellPhoto, type ExportDesign, sceneCollage, sceneFrame } from '@/editor/export-scene';
import { lookUpPlace, type PlaceLookup, UNKNOWN_PLACE } from '@/data/place-lookup';
import type { EditorData } from '@/editor/editor-data';
import { type LayerContext, type LayerImage, prepareLayers } from '@/editor/template-scene';
import { type TextOrigin, TypingOverlay } from '@/editor/typing-overlay';
import { Dock } from '@/editor/dock';
import { editorParamsSchema, type EditorRequest } from '@/editor/editor-params';
import { useEditorFonts } from '@/editor/fonts';
import { ActivityNotFoundError, catalogFor, loadEditorData } from '@/editor/load-editor-data';
import { ChoiceSheet } from '@/editor/choice-list';
import { LayerSheet, type PictureLook } from '@/editor/layer-sheet';
import { Notice, useNotice } from '@/editor/notice';
import { disposeLater, inParagraphArena } from '@/editor/paragraph-arena';
import { photoDominantColor } from '@/editor/photo-color';
import type { PickedPhoto } from '@/editor/photo-plan';
import { usePictures } from '@/editor/use-pictures';
import { preparePhoto } from '@/editor/prepare-photo';
import { FLOATING_INK, KeptMounted, PillButton, RoundButton } from '@/editor/round-button';
import { Chip, Row, StylePanel, widgetTools } from '@/editor/style-panel';
import {
  applyChoice,
  type DesignChoice,
  openChoice,
  parseDesignChoice,
} from '@/editor/design-choice';
import { saveToPhotos } from '@/editor/export-actions';
import { useStockPhotos } from '@/editor/stock-photos';
import { TemplateSheet } from '@/editor/template-sheet';
import { produceImage, useExport } from '@/editor/use-export';
import { type ColumnTool, WidgetColumn } from '@/editor/widget-column';
import { type PhotoRequest, usePhotoPicker } from '@/photos/use-photo-picker';
import { logError } from '@/ui/log';
import { useDisplaySettings } from '@/ui/settings';
import { SheetHost } from '@/ui/sheet';
import { ErrorView, LoadingView } from '@/ui/state-views';
import { Text } from '@/ui/text';
import { useAsync } from '@/ui/use-async';

/** The chosen photo and its two copies (see `photo-plan.ts`). */
interface EditorPhoto {
  /** Increases with every pick, so a slow preparation of a replaced photo is ignored. */
  readonly id: number;
  /** Its id in the library, which gives its file. */
  readonly libraryId: string;
  /** Its file; `null` while it is read (a photo only in iCloud is downloaded first). */
  readonly picked: PickedPhoto | null;
  /** Editor copy Skia draws on screen; `null` while it is being prepared. */
  readonly editorUri: string | null;
  /** Whether the editor copy was re-encoded (a failed decode of the original retries once). */
  readonly editorReencoded: boolean;
  /** Full-quality copy for exporting; `null` until prepared in the background. */
  readonly exportUri: string | null;
}

/** The room left between a widget being edited and the panel of its options, in points. */
/** How long after a photo is chosen its export copy starts, in milliseconds. */
const EXPORT_COPY_PAUSE_MS = 2500;

const PANEL_GAP = 16;
/** How the canvas rises over the panel of a widget's options, and settles back. */
const LIFT_TIMING = {
  duration: 250,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
} as const;

export default function Editor() {
  const { t } = useTranslation();
  const params = editorParamsSchema.safeParse(useLocalSearchParams());
  const paramsError = params.success ? null : z.prettifyError(params.error);
  useEffect(() => {
    if (paramsError !== null) {
      logError('Invalid editor route params', paramsError);
    }
  }, [paramsError]);
  if (!params.success) {
    return <ErrorView message={t('editor.error')} />;
  }
  return (
    <SheetHost>
      <EditorScreen params={params.data} />
    </SheetHost>
  );
}

function EditorScreen({ params }: { readonly params: EditorRequest }) {
  const { t } = useTranslation();
  const source = useActivitySource();
  const fonts = useEditorFonts();
  const data = useAsync(() => loadEditorData(source, params), JSON.stringify(params));
  /**
   * Another activity or period chosen in the editor, which keeps the design: loaded without
   * leaving the workspace, which shows the data it had meanwhile.
   */
  const [switched, setSwitched] = useState<EditorData | null>(null);
  const switchTo = async (request: EditorRequest) =>
    setSwitched(await loadEditorData(source, request));
  const [initialDesign] = useState(() => parseDesignChoice(params.design));

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
  return (
    <EditorWorkspace
      data={switched ?? data.data}
      fonts={fonts}
      onSwitch={switchTo}
      initialPhoto={params.photo ?? null}
      initialDesign={initialDesign}
    />
  );
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
  onSwitch,
  initialPhoto,
  initialDesign,
}: {
  readonly data: EditorData;
  readonly fonts: NonNullable<ReturnType<typeof useEditorFonts>>;
  /** Fills the design with another activity or period; rejects if it can't be loaded. */
  readonly onSwitch: (request: EditorRequest) => Promise<void>;
  /** The photo chosen before opening, by its library id, if one was. */
  readonly initialPhoto: string | null;
  /** The design chosen before opening, if one was. */
  readonly initialDesign: DesignChoice | null;
}) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const notice = useNotice();
  const { unit: deviceUnit, locale: appLocale } = useDisplaySettings();
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
  /** The place named once asked for, of the activity it was asked for (the design may switch). */
  const [askedPlace, setAskedPlace] = useState<{
    readonly id: string;
    readonly lookup: PlaceLookup;
  } | null>(null);
  const placeLookup =
    loaded.mode === 'activity' && askedPlace?.id === loaded.activity.id
      ? askedPlace.lookup
      : lookedUpPlace.status === 'success'
        ? lookedUpPlace.data
        : UNKNOWN_PLACE;
  const askPlace = (activity: Activity) =>
    lookUpPlace(startOf(activity), true).then((lookup) => {
      setAskedPlace({ id: activity.id, lookup });
      return lookup;
    });
  const data: EditorData =
    loaded.mode === 'activity' && placeLookup.status === 'known'
      ? { ...loaded, place: placeLookup.place }
      : loaded;
  /** What the galleries draw: the place, or a sample of it until the user allows naming it. */
  const shownData = galleryData(loaded, placeLookup, {
    city: t('gallery.placeSample.city'),
    region: t('gallery.placeSample.region'),
    country: t('gallery.placeSample.country'),
  });
  const defaultTemplate: DefaultTemplate = (format) =>
    emptyLayout(
      data.mode === 'activity'
        ? defaultActivityTemplate(data.activity, format)
        : defaultSummaryTemplate(data.summary, format),
    );
  /** What widgets need to be filled in and measured, in a unit and a language. */
  const contextFor = (
    widgetUnit: DistanceUnit,
    widgetLocale: string,
    translate: typeof t,
  ): LayerContext => ({
    data,
    fonts,
    textContext: {
      unit: widgetUnit,
      locale: widgetLocale,
      durationUnits: {
        hours: translate('durationUnits.hours'),
        minutes: translate('durationUnits.minutes'),
        seconds: translate('durationUnits.seconds'),
      },
      unitLabel: (metricUnit) => translate(`metricUnits.${metricUnit}`),
    },
    translate: (key, values) => translate(key, values),
  });
  /**
   * The whole design, format, photo placement and background included, one undo step per gesture
   * or change. It starts as chosen before opening, if it was: nothing to undo or to lose yet.
   */
  const [history, setHistory] = useState(() =>
    createHistory<EditorDesign>({
      ...(initialDesign === null
        ? INITIAL_DESIGN
        : openChoice(initialDesign, contextFor(deviceUnit, appLocale, t))),
      photoId: initialPhoto === null ? null : 0,
    }),
  );
  const design = history.present;
  /** How this canvas started, which Start over goes back to, whatever was chosen since. */
  const [canvasStart] = useState(() => designStart(design));
  /** The widgets' unit and language: the design's own, or the device's and the app's. */
  const unit = design.units ?? deviceUnit;
  const language: DesignLanguage = design.language ?? (appLocale === 'es' ? 'es' : 'en');
  const locale = design.language ?? appLocale;
  /** The widgets' texts, in the design's language. */
  const widgetT = design.language === null ? t : i18n.getFixedT(design.language);
  const template = layoutTemplate(defaultTemplate, design);
  /**
   * Whether the canvas has a design that writes the place (the Polaroid's) while naming it needs
   * the user's permission (Android): it is asked for then, once, as when such a widget is added; a
   * refusal leaves the date in its place.
   */
  const placeWanted =
    loaded.mode === 'activity' &&
    placeLookup.status === 'needsPermission' &&
    namesPlace(template.layers);
  const askedForDesign = useRef(false);
  useEffect(() => {
    if (placeWanted && loaded.mode === 'activity' && !askedForDesign.current) {
      askedForDesign.current = true;
      void askPlace(loaded.activity);
    }
    // Only when a design comes to want it: asking again on each render would repeat the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeWanted]);
  /** Applies a change of the design as one undo step (none when it changes nothing). */
  const change = (next: (current: EditorDesign) => EditorDesign) =>
    setHistory((current) => commit(current, next(current.present)));
  /** Applies a setting of the side menu, which is no edit: nothing to undo, or to start over. */
  const changeSetting = (next: (current: EditorDesign) => EditorDesign) =>
    setHistory((current) => mapHistory(current, next));
  /** Applies an edit of the widgets as one undo step. */
  const edit = (next: (template: Template) => Template) =>
    change((current) => editLayers(current, defaultTemplate, next));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Undo can take away the selected layer; then nothing is selected.
  const selected = template.layers.find((layer) => layer.id === selectedId) ?? null;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  /** Decoded as the editor opens, so its galleries have them at once. */
  const stock = useStockPhotos();
  const [formatsOpen, setFormatsOpen] = useState(false);
  const [collagesOpen, setCollagesOpen] = useState(false);
  /**
   * The photos of a collage's cells after the first, which is the editor's photo, by their keys in
   * `pictures`. They stay when the layout shows fewer, and come back with one that shows them.
   */
  const cellPictures = design.cells;
  /** The cell the photo's tools act on, in a collage. */
  const [toolsCell, setToolsCell] = useState(0);
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
  /**
   * The selected widget's scale or opacity while its bar is dragged, drawn by the canvas, and
   * which of them is.
   */
  const liveScale = useSharedValue(1);
  const liveOpacity = useSharedValue(1);
  const [adjusting, setAdjusting] = useState<'scale' | 'opacity' | 'background' | null>(null);
  /** Whether the photo's tools give way to the color menu of the design's background. */
  const [backgroundMenu, setBackgroundMenu] = useState(false);
  if (backgroundMenu && !photoTools) {
    setBackgroundMenu(false);
  }
  /** The widget whose verse, quote or phrase is being chosen again from its list. */
  const [choosingId, setChoosingId] = useState<string | null>(null);
  const choosing = template.layers.find((layer) => layer.id === choosingId);
  const choosingWords = choosing === undefined ? null : chosenWordsOf(choosing);
  /** Free text being typed, committed as one undo step on "Done". */
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const typing = textDraft !== null;
  /**
   * The user's pictures on the canvas (image layers). One that can't be opened leaves the design,
   * as one undo step.
   */
  const photoPicker = usePhotoPicker();
  const cellCount = design.collage === null ? 0 : collageCells(design.collage.layout).length;
  const shownCellPictures = cellPictures.slice(0, Math.max(0, cellCount - 1));
  // Undo can leave the tools on a cell the layout no longer has.
  if (toolsCell > 0 && toolsCell >= cellCount) {
    setToolsCell(0);
  }
  const pictures = usePictures(
    [
      ...template.layers.filter(isImageLayer).flatMap(layerPictures),
      ...shownCellPictures.filter((key) => key !== null),
    ],
    (key) => {
      notice.show(t('editor.photoError'));
      setHistory((current) =>
        mapHistory(current, (value) => ({
          ...value,
          cells: value.cells.map((cell) => (cell === key ? null : cell)),
        })),
      );
      // A slot of the design goes back to empty; a picture stuck on leaves it.
      edit((current) => ({ ...current, layers: withoutPicture(current.layers, key) }));
    },
    photoPicker.pick,
  );
  const phrases = usePhrases();
  /**
   * Every photo the editor has had, by its id, for undo to bring one back: only their files are kept,
   * and only the one on the canvas (`design.photoId`) is decoded.
   */
  const [photos, setPhotos] = useState<ReadonlyMap<number, EditorPhoto>>(
    () =>
      new Map(
        initialPhoto === null
          ? []
          : [
              [
                0,
                {
                  id: 0,
                  libraryId: initialPhoto,
                  picked: null,
                  editorUri: null,
                  editorReencoded: false,
                  exportUri: null,
                },
              ],
            ],
      ),
  );
  const photo = design.photoId === null ? null : (photos.get(design.photoId) ?? null);
  /** The full-quality copy being prepared in the background, to wait for it when exporting. */
  const pendingExportCopy = useRef<{ id: number; uri: Promise<string> } | null>(null);
  const skipExportPause = useRef<(() => void) | null>(null);
  /** Applies a change only if `id` is still the current photo. */
  const updatePhoto = (id: number, change: Partial<EditorPhoto>) =>
    setPhotos((current) => {
      const updated = current.get(id);
      return updated === undefined ? current : new Map(current).set(id, { ...updated, ...change });
    });

  const failPhoto = (id: number, context: string, error: unknown) => {
    logError(context, error);
    setPhotos((current) => new Map([...current].filter(([key]) => key !== id)));
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
      // After a moment: re-encoding a big photo takes every core for seconds, just as it is being
      // looked at and moved. Exporting before that doesn't wait for the moment (`exportCopyOf`).
      const exportCopy = new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, EXPORT_COPY_PAUSE_MS);
        skipExportPause.current = () => {
          clearTimeout(timer);
          resolve();
        };
      }).then(() => preparePhoto(picked, 'export'));
      pendingExportCopy.current = { id, uri: exportCopy };
      updatePhoto(id, { exportUri: await exportCopy });
    } catch (error) {
      // The editor keeps working; exporting will retry the full-quality copy.
      logError('Could not prepare the export copy of the photo', error);
    }
  };

  const canvasImage = useImage(photo?.editorUri, (error) => {
    if (photo?.picked == null) {
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
  /** The editor's photo, when a slot of the design shows it, as a picture among the others. */
  const pictureOfPhoto = (image: SkImage | null): LayerImage => ({
    size:
      image !== null
        ? { width: image.width(), height: image.height() }
        : photo?.picked != null
          ? { width: photo.picked.width, height: photo.picked.height }
          : SAMPLE_PICTURE,
    image,
  });
  const photoInSlot = usesEditorPhoto(template.layers);
  const layerContext: LayerContext = {
    ...contextFor(unit, locale, widgetT),
    images:
      photo === null
        ? pictures.images
        : new Map(pictures.images).set(EDITOR_PHOTO, pictureOfPhoto(canvasImage)),
    emptySlots: 'hint',
    phrases,
  };
  /** The gallery's tiles show the sample picture in their slots, not the sign to fill them. */
  const galleryContext: LayerContext = { ...layerContext, emptySlots: undefined };
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
  const catalog = catalogFor(data, unit, placeLookup.status !== 'unknown');
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const [nextPhotoId, setNextPhotoId] = useState(1);
  /**
   * Exporting replaces the controls with what to do with the image; the canvas, frozen meanwhile,
   * shows exactly what is exported.
   */
  const exporter = useExport();
  const exporting = exporter.state.status !== 'idle';
  /** The photo of each cell for the image: the full-quality copy of the first. */
  const exportCells = async (): Promise<readonly (SkImage | null)[]> => {
    if (design.collage === null) {
      return [];
    }
    return [
      photo === null ? null : await loadPhoto(await exportCopyOf(photo)),
      ...shownCellPictures.map((key) => (key === null ? null : cellImage(key))),
    ];
  };
  /** The design for the image: with the full-quality copy of its photo. */
  const exportDesign = async (): Promise<ExportDesign> => {
    const full =
      photo !== null && (design.collage === null || photoInSlot)
        ? await loadPhoto(await exportCopyOf(photo))
        : null;
    return {
      template,
      layerContext:
        full !== null && photoInSlot
          ? {
              ...layerContext,
              images: new Map(pictures.images).set(EDITOR_PHOTO, pictureOfPhoto(full)),
            }
          : layerContext,
      // In a collage or a design's slot, the photo goes there.
      photo: design.collage !== null || photoInSlot ? null : full,
      cells: await exportCells(),
      dominant,
    };
  };
  const startExport = () => {
    setSelectedId(null);
    setPhotoTools(false);
    setFormatsOpen(false);
    exporter.start(exportDesign);
  };
  /** The image is being saved from the bottom row. */
  const [savingNow, setSavingNow] = useState(false);
  /** Draws the image and saves it to the photo library at once, without the export's panel. */
  const saveNow = () => {
    setSelectedId(null);
    setPhotoTools(false);
    setFormatsOpen(false);
    setSavingNow(true);
    void (async () => {
      try {
        const { image, uri } = await produceImage(await exportDesign());
        const result = await saveToPhotos(uri);
        // Only encoded, never on the screen: nothing draws it.
        image.dispose();
        if (result === 'denied') {
          alertNoPhotosPermission(t);
        } else {
          notice.show(t('export.saved'));
          notificationAsync(NotificationFeedbackType.Success).catch((error: unknown) => {
            logError('Could not play a haptic', error);
          });
        }
      } catch (error) {
        logError('Could not save the image', error);
        notice.show(t('export.actionError'));
      } finally {
        setSavingNow(false);
      }
    })();
  };

  /** Whether the sheet to choose another activity or period shows, and one is being loaded. */
  const [dataOpen, setDataOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  /**
   * Fills the design with another activity or period (ADR 011): the design stays as it is, and
   * the widgets without data for it hide until data that has it comes back. Not an undo step: as
   * the photo, the data is what the design is made of, not part of it.
   */
  const switchData = (request: EditorRequest) => {
    setDataOpen(false);
    setSelectedId(null);
    setSwitching(true);
    onSwitch(request)
      .catch((error: unknown) => {
        logError('Could not load the chosen activity or period', error);
        notice.show(t('editor.switchError'));
      })
      .finally(() => setSwitching(false));
  };

  /** Says that a planned button's feature is on its way (ADR 009: every button shows already). */
  const comingSoon = () => notice.show(t('editor.comingSoon'));

  /**
   * The full-quality copy of `current` for exporting: the one ready, else the one being prepared
   * (waited for), else a new one if that failed or hasn't started.
   */
  const exportCopyOf = async (current: EditorPhoto): Promise<string> => {
    if (current.exportUri !== null) {
      return current.exportUri;
    }
    skipExportPause.current?.();
    const pending = pendingExportCopy.current;
    if (pending?.id === current.id) {
      try {
        return await pending.uri;
      } catch (error) {
        logError('Retrying the export copy of the photo', error);
      }
    }
    return preparePhoto(current.picked ?? (await pickedPhoto(current.libraryId)), 'export');
  };

  /** Reads the file of a photo just chosen, and prepares its copies. */
  const loadChosenPhoto = (id: number, libraryId: string) =>
    pickedPhoto(libraryId)
      .then((picked) => {
        updatePhoto(id, { picked });
        return preparePhotoCopies(id, picked, false);
      })
      .catch((error: unknown) => failPhoto(id, 'Could not read the chosen photo', error));
  // The photo chosen before opening, once.
  useEffect(() => {
    if (initialPhoto !== null) {
      void loadChosenPhoto(0, initialPhoto);
    }
    // Only as the editor opens: it never changes after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The photo's dominant color, the `auto` background: read once per photo from the editor copy
   * (a reduced copy of it, see `photo-color.ts`), and used for the export too, so both match.
   */
  /** A cell's picture, once decoded. */
  const cellImage = (key: string): SkImage | null => pictures.images.get(key)?.image ?? null;
  const firstCellImage = shownCellPictures
    .map((key) => (key === null ? null : cellImage(key)))
    .find((image) => image !== null);
  // The first photo of the design gives the color: the photo, or in a collage without it, the next.
  const dominantSource = canvasImage ?? firstCellImage ?? null;
  const dominant = dominantSource === null ? null : readDominant(dominantSource);
  /** The photos of the cells on the canvas, decoded or on their way. */
  const canvasCells: readonly CellPhoto[] =
    design.collage === null
      ? []
      : [
          photo === null ? null : (canvasImage ?? 'loading'),
          ...shownCellPictures.map((key) => (key === null ? null : (cellImage(key) ?? 'loading'))),
        ];

  /** How many photos the collage shows: they are pictures of the design, as the widgets' are. */
  const cellPhotos = canvasCells.filter((cell) => cell !== null).length;

  /**
   * The eyedropper, while it is open: a snapshot of the design, taken once when it opens, and what
   * the color it picks goes to, the selected widget or the background.
   */
  const [eyedropper, setEyedropper] = useState<{
    readonly target: 'layer' | 'background';
    readonly image: SkImage;
  } | null>(null);
  const openEyedropper = (target: 'layer' | 'background') => {
    void (async () => {
      try {
        const image = await snapshotDesign({
          template,
          layerContext,
          photo: photoInSlot ? null : canvasImage,
          cells: canvasCells.map((cell) => (cell === 'loading' ? null : cell)),
          dominant,
        });
        setEyedropper({ target, image });
      } catch (error) {
        logError('Could not take the snapshot for the eyedropper', error);
        notice.show(t('colorMenu.eyedropperError'));
      }
    })();
  };
  /** Closes the eyedropper; its snapshot is freed once the screen stops drawing it. */
  const closeEyedropper = () => {
    if (eyedropper !== null) {
      const { image } = eyedropper;
      disposeLater(() => image.dispose());
    }
    setEyedropper(null);
  };
  /**
   * The color picked, as one undo step: the widget's, or the background's at its opacity. Where
   * the design is transparent there is none to pick, and nothing changes.
   */
  const pickColor = (hex: string | null) => {
    if (hex === null) {
      // Nothing under the loupe: the color stays.
    } else if (eyedropper?.target === 'layer' && selectedId !== null) {
      edit((current) => setLayerColor(current, selectedId, hex));
    } else if (eyedropper?.target === 'background') {
      const shown = backgroundColor(design.background, dominant);
      const opacity = shown === null ? 1 : splitOpacity(shown).opacity;
      change((current) =>
        setBackground(current, { kind: 'color', color: withOpacity(hex, opacity) }),
      );
    }
    closeEyedropper();
  };

  /**
   * Picks a photo from the library and passes its key to `onPicked` (nothing if the user cancels).
   */
  /**
   * Asks for photos as `request` says (see `PhotoRequest`) and hands their library ids to
   * `onChosen`, none for "No photo"; nothing if the user closes the grid. A failure is logged and
   * noticed.
   */
  const choosePhotos = async (
    request: PhotoRequest,
    onChosen: (ids: readonly string[]) => void | Promise<void>,
  ) => {
    try {
      const ids = await photoPicker.choose(request);
      if (ids !== null) {
        await onChosen(ids);
      }
    } catch (error) {
      logError('Could not open the photo library', error);
      notice.show(t('editor.photoError'));
    }
  };

  const pickPicture = (onPicked: (key: string) => void) => {
    void (async () => {
      try {
        const key = await pictures.pick();
        if (key !== null) {
          onPicked(key);
        }
      } catch (error) {
        logError('Could not open the photo library', error);
        notice.show(t('editor.photoError'));
      }
    })();
  };

  /**
   * Adds a picture of the user's in its frame (an instant photo with its caption), picked from
   * the library, on top of the others and selected; a design takes up to `MAX_IMAGES`. A piece of
   * several photos (the slide viewer) asks for them all at once, in order. "No photo" adds it as a
   * slot showing the sign to fill it, which a saved design keeps (the user's choice). An instant
   * photo of where it was asks first to name the place (Android), and writes the date without it.
   * A holder as big as the canvas (the camera, the crop screen) holds the canvas's own photo (see
   * `coversCanvas`): with none, the one picked becomes it, in the same undo step.
   */
  const addPicture = ({ frame, caption, mount }: PictureLook) => {
    setSheetOpen(false);
    const count = mountWindows(mount);
    if (!canAddImage(template, cellPhotos, count)) {
      notice.show(t('editor.maxImages', { max: String(MAX_IMAGES) }));
      return;
    }
    const look = {
      kind: 'image',
      frame,
      ...(caption === undefined ? {} : { caption }),
      ...(mount === undefined ? {} : { mount }),
    } as const;
    if (coversCanvas(mount)) {
      const item = { ...look, image: EDITOR_PHOTO };
      if (photo !== null) {
        addLayerNow(item);
        return;
      }
      void choosePhotos({ max: 1, allowNone: true }, (ids) => {
        const [libraryId] = ids;
        if (libraryId === undefined) {
          // With no photo yet, it shows the sign to choose the canvas's.
          addLayerNow(item);
          return;
        }
        const id = uniqueLayerId(template, catalogItemKey(item));
        setCanvasPhoto(libraryId, (current) =>
          editLayers(current, defaultTemplate, (layers) => placeLayer(layers, item, id)),
        );
        selectLayer(id);
      });
      return;
    }
    const pick = () =>
      void choosePhotos({ max: count, allowNone: true }, async (ids) => {
        if (ids.length === 0) {
          addLayerNow({
            ...look,
            image: SAMPLE_IMAGE,
            ...(mount === undefined ? { slot: true } : {}),
          });
          return;
        }
        const [image, ...extraImages] = await Promise.all(ids.map((id) => pictures.add(id)));
        addLayerNow({ ...look, image, ...(extraImages.length === 0 ? {} : { extraImages }) });
      });
    if (
      caption === 'place' &&
      placeLookup.status === 'needsPermission' &&
      data.mode === 'activity'
    ) {
      void askPlace(data.activity).then(() => pick());
      return;
    }
    pick();
  };

  /**
   * Shows another picture in the window `which` of the image layer `id` (`all`: its button's, all
   * of them anew, in order), as one undo step. In a slot with the editor's
   * photo, it replaces that photo: the slot would give the canvas back the one it took. In a slot
   * that keeps the canvas's photo (the Polaroid's) over a canvas with none, the photo goes behind it
   * too, so the design shows whole with one photo (the user's choice); another background is then
   * chosen as always.
   */
  const changePicture = (id: string, which: number | 'all' = 0) => {
    const layer = template.layers.find((candidate) => candidate.id === id);
    if (layer === undefined || !isImageLayer(layer)) {
      return;
    }
    const inWindows = layerPictures(layer);
    // Its button changes them all, but a window with the canvas's photo, which is changed as such.
    const window = which === 'all' ? 0 : which;
    if (which !== 'all' && inWindows[window] === EDITOR_PHOTO) {
      void pickPhoto();
      return;
    }
    // An empty window asks for those still empty, from it on and then those before it, all at once
    // in order; a full one, for its own photo.
    const targets =
      which === 'all'
        ? [...inWindows.keys()].filter((i) => inWindows[i] !== EDITOR_PHOTO)
        : isEmptyWindow(layer, window, photo !== null)
          ? [...inWindows.keys()]
              .map((i) => (window + i) % inWindows.length)
              .filter((i) => inWindows[i] === SAMPLE_IMAGE)
          : [window];
    if (targets.length === 0) {
      void pickPhoto();
      return;
    }
    if (targets.length > 1) {
      setPhotoTools(false);
      void choosePhotos({ max: targets.length, allowNone: false }, async (ids) => {
        const keys = await Promise.all(ids.map((one) => pictures.add(one)));
        edit((current) =>
          keys.reduce((next, key, i) => setLayerImage(next, id, key, targets[i]), current),
        );
      });
      return;
    }
    const [only] = targets;
    pickPicture((image) => edit((current) => setLayerImage(current, id, image, only)));
  };

  /** Adds a widget on top of the others and selects it, ready to be dragged into place. */
  const addNewLayer = (item: Exclude<NewLayer, { kind: 'text' | 'image' }>) => {
    // The place needs the permission first (Android): asked now, the widget is added once named.
    if (
      ((item.kind === 'info' && item.field === 'activityPlace') ||
        (item.kind === 'activityBlock' && item.block.design === 'location')) &&
      placeLookup.status === 'needsPermission' &&
      data.mode === 'activity'
    ) {
      void askPlace(data.activity).then((result) => {
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
  /** `current` with the widget `item` added as `id`, on top of the others. */
  const placeLayer = (
    current: Template,
    item: Exclude<NewLayer, { kind: 'text' }>,
    id: string,
  ): Template => {
    const added = addLayer(current, newLayer(item, id, current.format, designFont(current.layers)));
    // As big as the canvas, it goes under the widgets there, not to hide them.
    return item.kind === 'image' && fillsCanvas(item.mount) ? moveLayer(added, id, 'back') : added;
  };
  const addLayerNow = (item: Exclude<NewLayer, { kind: 'text' }>) => {
    const id = uniqueLayerId(template, catalogItemKey(item));
    edit((current) => placeLayer(current, item, id));
    selectLayer(id);
    setSheetOpen(false);
  };

  /**
   * Starts the design again, as one undo step, with `next` (given no photos: those of the widgets
   * leave with them, and the canvas's and the cells' stay where they are).
   */
  const startAgain = (next: (pictures: readonly string[]) => EditorDesign): EditorDesign => {
    // The widgets' photos stay in the widgets and leave with them; the canvas's and the cells' stay
    // where they are (the user's rule): a design's slots come empty, each with its sign.
    const started = next([]);
    change(() => started);
    setSelectedId(null);
    setPhotoTools(false);
    setToolsCell(0);
    return started;
  };

  /** Starts the design again from a choice of the Designs gallery, and closes the sheet. */
  const chooseDesign = (choice: DesignChoice) => {
    startAgain((pictures) => applyChoice(design, choice, layerContext, pictures));
    setTemplatesOpen(false);
  };

  /**
   * Another layout in the Collages panel, as one undo step: over a design it starts again; otherwise
   * it only lays the photos out, and the same one does nothing.
   */
  const pickCollage = (layout: CollageLayout | null) => {
    startAgain(() => setCollageLayout(design, layout));
  };

  /** Another format: the widgets keep their relative places, inside the canvas if they were. */
  const chooseFormat = (format: CanvasFormat) => {
    // Each widget measured in the formats it is placed from and goes to, so that what fitted the
    // canvas still does, and comes back as it was.
    const formats = [
      ...new Set([
        template.format,
        format,
        ...Object.values(design.fitted).map((one) => one.format),
      ]),
    ];
    const measured = inParagraphArena(
      () =>
        new Map(
          formats.map((inFormat) => [
            inFormat,
            new Map(
              prepareLayers({ ...template, format: inFormat }, layerContext).map(
                ({ layer, width, height }) => [layer.id, { width, height }] as const,
              ),
            ),
          ]),
        ),
    );
    measured.dispose();
    changeSetting((current) =>
      setFormat(current, format, (id, inFormat) => measured.value.get(inFormat)?.get(id)),
    );
    // The menu stays open, as the collages' does, until the user closes it (the user's choice).
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
   * Rewrites a free text, changes a picture (that of `window`, if it has several), or opens the list of a verse, a quote or a chat
   * message's phrase to choose other words; the other widgets have nothing to edit (see
   * `canEditLayer`).
   */
  const editLayer = (layer: Layer, window?: number) => {
    if (layer.kind === 'text') {
      startTyping(editTextDraft(layer));
    } else if (layer.kind === 'image') {
      // Its button knows no window: a piece of several asks for all its photos again.
      changePicture(layer.id, window ?? 'all');
    } else if (chosenWordsOf(layer) !== null) {
      setChoosingId(layer.id);
    }
  };
  const canEditLayer = (layer: Layer) =>
    layer.kind === 'text' || layer.kind === 'image' || chosenWordsOf(layer) !== null;

  /**
   * A tap on the selected widget edits it as its Edit button does, as in a story editor. While it
   * leaves no canvas to tap on, whichever it is and however it got there, it lets go instead, or it
   * could never be let go of: its action stays on its button (the user's choice).
   */
  const tapSelected = (id: string, at: { readonly x: number; readonly y: number }) => {
    const layer = template.layers.find((candidate) => candidate.id === id);
    if (layer === undefined) {
      return;
    }
    const window = tappedWindow(layer, at);
    const covers =
      selectedSize !== null &&
      layerCoversCanvas(layer.transform, selectedSize, CANVAS_FORMATS[template.format]);
    if (covers && !isEmptyWindow(layer, window, photo !== null)) {
      setSelectedId(null);
    } else {
      editLayer(layer, window);
    }
  };

  /** The window of `layer` at `at` (canvas pixels): the slide touched, in a slide viewer. */
  const tappedWindow = (layer: Layer, at: { readonly x: number; readonly y: number }) =>
    isImageLayer(layer)
      ? windowAt(
          layer,
          layerPoint(layer.transform, at, CANVAS_FORMATS[template.format]),
          CANVAS_FORMATS[template.format],
        )
      : 0;

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
   * the background, also without a photo (a sticker over a color); and another goes straight to
   * changing the photo, as with a widget's second tap (the user's choice). Their Done button closes
   * the tools. A design's slots have the photo instead: there is none here to change.
   */
  const tapPhoto = (at: { readonly x: number; readonly y: number }) => {
    if (selectedId !== null) {
      setSelectedId(null);
    } else if (design.collage === null) {
      if (!photoTools) {
        setPhotoTools(true);
      } else if (backgroundMenu || photoInSlot) {
        setPhotoTools(false);
      } else {
        void pickPhoto();
      }
    } else {
      const cell = cellAt(design.collage.layout, at.x, at.y);
      if (canvasCells[cell] === null) {
        // Empty: straight to its photo.
        setPhotoTools(false);
        chooseCellPhoto(cell);
      } else if (photoTools && cell === toolsCell) {
        // The same one again: straight to changing its photo, or out of the background's colors.
        if (backgroundMenu) {
          setPhotoTools(false);
        } else {
          chooseCellPhoto(cell);
        }
      } else {
        // Another cell's photo moves the tools to it.
        setPhotoTools(true);
        setToolsCell(cell);
      }
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

  /** Picks the canvas's photo from the grid, as one undo step. */
  const pickPhoto = async () => {
    setPhotoTools(false);
    const libraryId = await photoPicker.pick();
    if (libraryId !== null) {
      setCanvasPhoto(libraryId, (design) => design);
    }
  };

  /**
   * Makes the photo `libraryId` of the library, already chosen, the canvas's, as one undo step with
   * `alongWith` (a widget that comes with it).
   */
  const setCanvasPhoto = (libraryId: string, alongWith: (design: EditorDesign) => EditorDesign) => {
    const id = nextPhotoId;
    setNextPhotoId(id + 1);
    setPhotos((current) =>
      new Map(current).set(id, {
        id,
        libraryId,
        picked: null,
        editorUri: null,
        editorReencoded: false,
        exportUri: null,
      }),
    );
    // A new photo starts centered and covering the canvas (user's choice), as one undo step.
    change((current) =>
      alongWith({
        ...setCellPlacement(setPhotoPlacement(current, COVER_PLACEMENT), 0, COVER_PLACEMENT),
        photoId: id,
      }),
    );
    void loadChosenPhoto(id, libraryId);
  };

  /**
   * Back to no photo: the design goes on over its background (transparent by default, as a
   * sticker); the widgets stay.
   */
  const removePhoto = () => {
    setPhotoTools(false);
    change((current) => ({ ...setPhotoPlacement(current, COVER_PLACEMENT), photoId: null }));
  };

  /** Shows `key` in a cell after the first, centered and covering it. */
  const setCellPicture = (cell: number, key: string | null) => {
    change((current) => ({
      ...setCellPlacement(current, cell, COVER_PLACEMENT),
      cells: current.cells.map((old, i) => (i === cell - 1 ? key : old)),
    }));
  };

  /**
   * Lets the user choose the photo of a cell. The first is the editor's photo. An empty one asks for
   * all those still empty at once, from it on and then those before it, in order, as many as the
   * design still takes (the user's choice, as the pieces of several photos), in one step.
   */
  const chooseCellPhoto = (cell: number) => {
    setPhotoTools(false);
    // A cell that has a photo only changes it; an empty one adds another to the design.
    if (canvasCells[cell] === null && !canAddImage(template, cellPhotos)) {
      notice.show(t('editor.maxImages', { max: String(MAX_IMAGES) }));
      return;
    }
    if (canvasCells[cell] === null) {
      const room = MAX_IMAGES - imageCount(template.layers) - cellPhotos;
      const targets = [...Array(cellCount).keys()]
        .map((i) => (cell + i) % cellCount)
        .filter((i) => canvasCells[i] === null)
        .slice(0, room);
      if (targets.length > 1) {
        void choosePhotos({ max: targets.length, allowNone: false }, async (ids) => {
          const chosen = ids.map((id, i) => ({ id, cell: targets[i] }));
          const others = await Promise.all(
            chosen
              .filter((one) => one.cell !== 0)
              .map(async (one) => ({ cell: one.cell, key: await pictures.add(one.id, 'cell') })),
          );
          const fill = (current: EditorDesign) =>
            others.reduce(
              (next, { cell: at, key }) => ({
                ...setCellPlacement(next, at, COVER_PLACEMENT),
                cells: next.cells.map((old, i) => (i === at - 1 ? key : old)),
              }),
              current,
            );
          const first = chosen.find((one) => one.cell === 0);
          if (first !== undefined) {
            setCanvasPhoto(first.id, fill);
          } else {
            change(fill);
          }
        });
        return;
      }
    }
    if (cell === 0) {
      void pickPhoto();
      return;
    }
    void (async () => {
      try {
        const key = await pictures.pick('cell');
        if (key !== null) {
          setCellPicture(cell, key);
        }
      } catch (error) {
        logError('Could not read the photo for a cell', error);
        notice.show(t('editor.photoError'));
      }
    })();
  };

  /** Empties a cell: it goes back to its sign, and to the background in the image. */
  const removeCellPhoto = (cell: number) => {
    setPhotoTools(false);
    if (cell === 0) {
      change((current) => ({ ...setCellPlacement(current, 0, COVER_PLACEMENT), photoId: null }));
    } else {
      setCellPicture(cell, null);
    }
  };

  // Leaving with edits asks first: the design is not kept. The photo alone doesn't count: it was
  // chosen on the screen under this one, and stays in the library. Going back while exporting
  // leaves the export, while typing commits the text, and with the eyedropper open closes it.
  const unsaved = canStartOver(design, canvasStart);
  /**
   * Whether the user confirmed leaving: prevention stops and the blocked action is repeated
   * (expo-router's `repeat`; dispatching it again while still prevented did nothing).
   */
  const [leaving, setLeaving] = useState(false);
  usePreventRemove(
    !leaving && (unsaved || exporting || typing || eyedropper !== null),
    ({ repeat }) => {
      if (eyedropper !== null) {
        closeEyedropper();
      } else if (exporting) {
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
    },
  );
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
  // the panel closes, or steps aside for the eyedropper, which looks at the whole canvas. Not an
  // edit: the design doesn't change.
  const lift =
    dock === 'style' &&
    eyedropper === null &&
    selected !== null &&
    selectedSize !== null &&
    dockHeight > 0 &&
    area
      ? (() => {
          const ratio = displayWidth / size.width;
          const reach = layerVerticalReach(selected.transform, selectedSize, size, LAYER_MARGIN);
          return liftToClear(
            { top: canvasTop + reach.top * ratio, bottom: canvasTop + reach.bottom * ratio },
            area.height - DOCK_EDGE - dockHeight,
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
  const controlsShown = !dragging && !typing && eyedropper === null;

  const photoToolsLabelSize = actionLabelSize(photoToolLabels((key) => t(key)));
  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <ChoiceSheet
        words={choosingWords}
        language={language}
        onChoose={(words) => {
          if (choosingId !== null) {
            edit((current) => setChosenWords(current, choosingId, words));
          }
          setChoosingId(null);
        }}
        onClose={() => setChoosingId(null)}
      />
      {photoPicker.sheet}
      <LayerSheet
        visible={sheetOpen}
        catalog={catalog}
        format={template.format}
        font={designFont(template.layers)}
        // Until the user allows naming the place, the gallery shows it with a sample name.
        layerContext={{ ...galleryContext, data: shownData }}
        language={language}
        stock={stock}
        onAdd={addNewLayer}
        onAddText={addText}
        onAddImage={addPicture}
        onClose={() => setSheetOpen(false)}
      />
      <DataSheet
        visible={dataOpen}
        mode={data.mode}
        onChooseActivity={(activityId) =>
          data.mode === 'activity' && activityId === data.activity.id
            ? setDataOpen(false)
            : switchData({ mode: 'activity', activityId })
        }
        onChoosePeriod={({ kind, range, families }) =>
          switchData({
            mode: 'summary',
            kind,
            start: range.start,
            end: range.end,
            families: [...families],
          })
        }
        onClose={() => setDataOpen(false)}
      />
      <TemplateSheet
        visible={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        format={design.format}
        design={template}
        layerContext={{ ...layerContext, data: shownData }}
        stock={stock}
        userTemplates={userTemplates}
        onChoose={chooseDesign}
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
            style={[{ overflow: 'hidden' }, liftStyle]}
          >
            <EditorCanvas
              displayWidth={displayWidth}
              template={shownTemplate}
              layerContext={layerContext}
              photo={design.collage === null && !photoInSlot ? canvasImage : null}
              collage={sceneCollage(
                shownTemplate,
                canvasCells,
                true,
                // Only while its tools act on it: the background is the whole design's.
                photoTools && !backgroundMenu && canvasCells[toolsCell] !== null ? toolsCell : null,
              )}
              frame={sceneFrame(shownTemplate)}
              onCellGrab={setToolsCell}
              onCellPlacementChange={(cell, placement) =>
                change((current) => setCellPlacement(current, cell, placement))
              }
              placement={design.photo}
              backdrop={backgroundColor(design.background, dominant)}
              selectedId={typing ? null : selectedId}
              adjusting={adjusting}
              adjustedScale={liveScale}
              adjustedOpacity={liveOpacity}
              onSelect={selectLayer}
              onTapSelected={tapSelected}
              onTapLayer={(id, at) => {
                const layer = template.layers.find((candidate) => candidate.id === id);
                const window = layer === undefined ? 0 : tappedWindow(layer, at);
                if (layer !== undefined && isEmptyWindow(layer, window, photo !== null)) {
                  changePicture(id, window);
                }
              }}
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
            {eyedropper === null ? null : (
              <Eyedropper image={eyedropper.image} displayWidth={displayWidth} onPick={pickColor} />
            )}
            {switching || (photo !== null && canvasImage === null) ? (
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
                <Spinner
                  size={36}
                  color="#FFFFFF"
                  accessibilityLabel={t(switching ? 'common.loading' : 'editor.loadingPhoto')}
                />
              </View>
            ) : null}
          </Animated.View>
        ) : null}
      </View>

      {formatsOpen || collagesOpen || moreOpen ? (
        // A tap anywhere else closes the formats' panel or the "…" menu, as with any menu.
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={() => {
            setFormatsOpen(false);
            setCollagesOpen(false);
            setMoreOpen(false);
          }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
      {eyedropper === null ? null : (
        // The eyedropper's way out, where the close button was.
        <View style={{ position: 'absolute', top: insets.top + EDGE, left: EDGE }}>
          <RoundButton
            icon="close"
            label={t('colorMenu.cancelEyedropper')}
            onPress={closeEyedropper}
          />
        </View>
      )}
      {controlsShown && !exporting ? (
        <View style={{ position: 'absolute', top: insets.top + EDGE, left: EDGE }}>
          <EditorTopBar
            onClose={close}
            onUndo={() => setHistory(undo)}
            onRedo={() => setHistory(redo)}
            onStartOver={() => change((current) => startOver(current, canvasStart))}
            canUndo={canUndo(history)}
            canRedo={canRedo(history)}
            canStartOver={canStartOver(design, canvasStart)}
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
          onDepth={comingSoon}
          format={design.format}
          formatsOpen={formatsOpen}
          onFormatsOpenChange={setFormatsOpen}
          onPickFormat={chooseFormat}
          collage={design.collage?.layout ?? null}
          inDesign={design.isDesign}
          collagesOpen={collagesOpen}
          onCollagesOpenChange={setCollagesOpen}
          onPickCollage={pickCollage}
          onDesigns={() => {
            setFormatsOpen(false);
            setTemplatesOpen(true);
          }}
          onActivity={() => setDataOpen(true)}
          sport={data.mode === 'activity' ? sportIcon(data.activity) : null}
          units={unit}
          onToggleUnits={() =>
            changeSetting((current) => setUnits(current, unit === 'km' ? 'mi' : 'km'))
          }
          language={language}
          onToggleLanguage={() =>
            changeSetting((current) => setLanguage(current, language === 'es' ? 'en' : 'es'))
          }
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
              onEdit: canEditLayer(selected) ? () => editLayer(selected) : undefined,
              onDuplicate: () => duplicateSelected(selected.id),
              onBringToFront: () => edit((current) => moveLayer(current, selected.id, 'front')),
              onSendToBack: () => edit((current) => moveLayer(current, selected.id, 'back')),
              onRemove: () => {
                edit((current) => removeLayer(current, selected.id));
                setSelectedId(null);
              },
              canDuplicate:
                canAddLayer(template) &&
                (!isImageLayer(selected) || canAddImage(template, cellPhotos)),
              canBringToFront: canMoveLayer(template, selected.id, 'front'),
              canSendToBack: canMoveLayer(template, selected.id, 'back'),
            }}
            liveScale={liveScale}
            onResizeStart={() => setAdjusting('scale')}
            onResize={(scale) => {
              // The new size and the end of the live drawing in one update: no stale frame.
              edit((current) =>
                setLayerTransform(current, selected.id, { ...selected.transform, scale }),
              );
              setAdjusting(null);
            }}
          />
        </View>
      ) : null}
      {controlsShown && dock === null ? (
        // Symmetric: the photo and a text at the left, "+", the main thing to do, in the middle, and
        // saving and exporting, what finishes the image, at the right.
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            bottom: insets.bottom + EDGE,
            left: EDGE,
            right: EDGE,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* The photo's tools, as a tap on it opens them; without a photo, the picker straight
                away (a tap on the empty canvas still opens the background). Here rather than over
                the canvas, where it kept widgets from being moved. */}
            <RoundButton
              icon="photos"
              label={t(
                photo === null && design.collage === null
                  ? 'editor.choosePhoto'
                  : 'editor.photoTools',
              )}
              onPress={
                photo === null && design.collage === null ? () => void pickPhoto() : openPhotoTools
              }
              size={BOTTOM_BUTTON_SIZE}
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
            icon="add"
            iconSize={30}
            label={t('editor.addLayer')}
            onPress={() => setSheetOpen(true)}
            disabled={!canAddLayer(template)}
            height={BOTTOM_BUTTON_SIZE}
            minWidth={ADD_BUTTON_WIDTH}
          />
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: BOTTOM_PAIR_GAP,
            }}
          >
            <RoundButton
              icon="save"
              label={t('export.save')}
              onPress={saveNow}
              disabled={savingNow}
              size={BOTTOM_BUTTON_SIZE}
            />
            <PillButton
              icon="export"
              label={t('editor.export')}
              onPress={startExport}
              accent
              height={BOTTOM_BUTTON_SIZE}
            />
          </View>
        </View>
      ) : null}
      {controlsShown && dock !== null ? (
        <View
          onLayout={(event) => setDockHeight(event.nativeEvent.layout.height)}
          style={{
            position: 'absolute',
            left: DOCK_EDGE,
            right: DOCK_EDGE,
            bottom: insets.bottom + DOCK_EDGE,
          }}
        >
          <Dock
            onDone={
              dock === 'export'
                ? exporter.stop
                : dock === 'style'
                  ? () => setTool(null)
                  : backgroundMenu
                    ? () => setBackgroundMenu(false)
                    : () => setPhotoTools(false)
            }
          >
            {dock === 'export' ? (
              <ExportBar state={exporter.state} onRetry={startExport} onStory={comingSoon} />
            ) : styled !== null ? (
              <StylePanel
                layer={styled.layer}
                tool={styled.tool}
                onChange={edit}
                layerContext={layerContext}
                liveOpacity={liveOpacity}
                onOpacityStart={() => setAdjusting('opacity')}
                onOpacity={(opacity) => {
                  // As with the size: the opacity and the end of the live drawing together.
                  edit((current) => setLayerOpacity(current, styled.layer.id, opacity));
                  setAdjusting(null);
                }}
                onEyedropper={() => openEyedropper('layer')}
              />
            ) : backgroundMenu ? (
              <BackgroundMenu
                background={design.background}
                dominant={dominant}
                onChange={(background) => change((current) => setBackground(current, background))}
                liveOpacity={liveOpacity}
                onOpacityStart={() => setAdjusting('background')}
                onOpacity={(background) => {
                  // As with a widget's: the opacity and the end of the live drawing together.
                  change((current) => setBackground(current, background));
                  setAdjusting(null);
                }}
                onEyedropper={() => openEyedropper('background')}
              />
            ) : (
              <>
                {/* Removing first, on its own at the left (user's choice), then change, cover and the
                    background. */}
                <View style={{ height: 50, justifyContent: 'center' }}>
                  <Row>
                    {IMAGE_FRAMES.map((frame) => (
                      <Chip
                        key={frame}
                        label={t(`editor.collageFrames.${frame}`)}
                        selected={design.frame === frame}
                        onPress={() => change((current) => setFrame(current, frame))}
                      />
                    ))}
                  </Row>
                </View>
                <View style={{ flexDirection: 'row', gap: ACTION_TILE_GAP }}>
                  <ActionTile
                    icon="trash"
                    label={t('editor.removePhoto')}
                    labelSize={photoToolsLabelSize}
                    onPress={
                      design.collage === null ? removePhoto : () => removeCellPhoto(toolsCell)
                    }
                    disabled={
                      design.collage === null ? photo === null : canvasCells[toolsCell] === null
                    }
                    destructive
                  />
                  <ActionTile
                    icon="photos"
                    labelSize={photoToolsLabelSize}
                    label={t(
                      (design.collage === null ? photo === null : canvasCells[toolsCell] === null)
                        ? 'editor.choosePhoto'
                        : 'editor.changePhoto',
                    )}
                    onPress={() =>
                      design.collage === null ? void pickPhoto() : chooseCellPhoto(toolsCell)
                    }
                  />
                  <ActionTile
                    icon="restart"
                    label={t('editor.resetPhoto')}
                    labelSize={photoToolsLabelSize}
                    onPress={() =>
                      change((current) =>
                        design.collage === null
                          ? setPhotoPlacement(current, COVER_PLACEMENT)
                          : setCellPlacement(current, toolsCell, COVER_PLACEMENT),
                      )
                    }
                    disabled={
                      design.collage === null
                        ? photo === null || samePlacement(design.photo, COVER_PLACEMENT)
                        : canvasCells[toolsCell] === null ||
                          samePlacement(design.collage.placements[toolsCell], COVER_PLACEMENT)
                    }
                  />
                  <ActionTile
                    icon="paint"
                    label={t('editor.background')}
                    labelSize={photoToolsLabelSize}
                    onPress={() => setBackgroundMenu(true)}
                  />
                </View>
              </>
            )}
          </Dock>
        </View>
      ) : null}
      <Notice message={notice.message} />
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
 * The design's background in the color menu: the photo's own color (auto, its dominant one) and
 * none (transparent, as a sticker) first, then any color; the photo's color or any other, at an
 * opacity. Without a photo's color, auto is none: only "Transparent" shows, chosen. Each choice is
 * one undo step.
 */
function BackgroundMenu({
  background,
  dominant,
  onChange,
  liveOpacity,
  onOpacityStart,
  onOpacity,
  onEyedropper,
}: {
  readonly background: DesignBackground;
  /** The photo's dominant color, shown on the auto swatch; `null` while unknown. */
  readonly dominant: string | null;
  readonly onChange: (background: DesignBackground) => void;
  /** The background's opacity while its bar is dragged, which the canvas draws. */
  readonly liveOpacity: SharedValue<number>;
  readonly onOpacityStart: () => void;
  /** Called with the background at the opacity chosen, once, when the bar is let go. */
  readonly onOpacity: (background: DesignBackground) => void;
  readonly onEyedropper: () => void;
}) {
  const { t } = useTranslation();
  const own = background.kind === 'color' ? splitOpacity(background.color) : null;
  const photoColor = background.kind === 'auto' ? dominant : null;
  // What the bar fades, and at what opacity: a color, or the photo's; none has no opacity.
  const shown =
    own ?? (photoColor === null ? null : { hex: photoColor, opacity: autoOpacity(background) });
  /** The photo's color at `opacity`, opaque without the field. */
  const auto = (opacity: number): DesignBackground =>
    opacity < 1 ? { kind: 'auto', opacity } : { kind: 'auto' };
  return (
    <ColorMenu
      color={own?.hex ?? null}
      onColor={(hex) => onChange({ kind: 'color', color: withOpacity(hex, shown?.opacity ?? 1) })}
      opacity={{
        value: shown?.opacity ?? 1,
        disabled: shown === null,
        color: shown?.hex,
        live: liveOpacity,
        onStart: onOpacityStart,
        onEnd: (opacity) => {
          if (own !== null) {
            onOpacity({ kind: 'color', color: withOpacity(own.hex, opacity) });
          } else if (background.kind === 'auto') {
            onOpacity(auto(opacity));
          }
        },
      }}
      specials={[
        ...(dominant === null
          ? []
          : [
              {
                key: 'auto',
                label: t('editor.backgrounds.auto'),
                fill: dominant,
                selected: background.kind === 'auto',
                onPress: () => onChange(auto(shown?.opacity ?? 1)),
              },
            ]),
        {
          key: 'transparent',
          label: t('editor.backgrounds.transparent'),
          fill: null,
          // Without the photo's color, auto shows nothing: it is none.
          selected:
            background.kind === 'transparent' || (background.kind === 'auto' && dominant === null),
          onPress: () => onChange({ kind: 'transparent' }),
        },
      ]}
      onEyedropper={onEyedropper}
    />
  );
}

/** The opacity of a background of the photo's color, 1 when it has none. */
function autoOpacity(background: DesignBackground): number {
  return background.kind === 'auto' ? (background.opacity ?? 1) : 1;
}

/**
 * A floating panel over the canvas with a set of tools and "Done" under them, which closes it
 * (the widget stays selected).
 */
