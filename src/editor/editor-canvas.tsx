import {
  Canvas,
  FilterMode,
  Group,
  Image,
  Line,
  MipmapMode,
  Path,
  Skia,
  type SkImage,
  type Transforms3d,
} from '@shopify/react-native-skia';
import { ImpactFeedbackStyle, impactAsync } from 'expo-haptics';
import { type ReactElement, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelRatio, Pressable, View } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  usePinchGesture,
  useRotationGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolateColor,
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { splitOpacity } from '@/core/color-menu';
import {
  hitTestLayers,
  LAYER_MARGIN,
  type LayerBox,
  type LayerTransform,
  rotateLayer,
  scaleLayer,
  type SnapLine,
  snapLayer,
  translateLayer,
} from '@/core/layer-transform';
import { drawInCell } from '@/core/collage';
import {
  FILTER_PAGES,
  pageAfterSwipe,
  pageBeside,
  type PhotoFilterId,
  swipeOffset,
} from '@/core/photo-filter';
import {
  COVER_PLACEMENT,
  drawPhoto,
  panPlacement,
  type PhotoDrawing,
  type PhotoPlacement,
  rotatePlacement,
  type Size,
  snapPlacement,
  zoomPlacement,
} from '@/core/photo-placement';
import { CANVAS_FORMATS, type Template } from '@/core/template';
import { colors } from '@/theme/colors';
import { AppIcon } from '@/ui/app-icon';
import { logError } from '@/ui/log';
import { Text } from '@/ui/text';

import { type TextureRequest, useGestureTextures } from './gesture-textures';
import {
  type DrawRect,
  type LayerContext,
  layerClip,
  layerMatrix,
  photoMatrix,
  photoRect,
  PreparedLayerCache,
  type SceneCollage,
  type SceneFrame,
  type SceneTextures,
  TemplateScene,
} from './template-scene';

interface EditorCanvasProps {
  /** On-screen width; the height follows the template format. */
  readonly displayWidth: number;
  /**
   * The area the canvas goes in the middle of. Skia's view takes all of it, never changing size or
   * place, and the scene is drawn placed and clipped inside it: on a change of format, a view that
   * moved and shrank a frame before Skia drew it showed the old drawing in the new place (the
   * user's recording, on the iPhone). Touches go to a view of the canvas's own size over it.
   */
  readonly area: { readonly width: number; readonly height: number };
  readonly template: Template;
  readonly layerContext: LayerContext;
  /** The photo, or `null` for none. */
  readonly photo: SkImage | null;
  /** The photos of a collage, drawn instead of `photo`, which is then `null`. */
  readonly collage: SceneCollage | null;
  /** The frame around the photos. */
  readonly frame: SceneFrame | null;
  /** A photo of a collage was taken by the fingers: the tools, if open, go to its cell. */
  readonly onCellGrab: (cell: number) => void;
  /** Called once per gesture on a photo of a collage, when the fingers lift. */
  readonly onCellPlacementChange: (cell: number, placement: PhotoPlacement) => void;
  /** Where the photo goes; the template's own, kept apart so gestures can move it live. */
  readonly placement: PhotoPlacement;
  /** The background's color where the photo leaves the canvas empty; `null` shows none. */
  readonly backdrop: string | null;
  /**
   * The background's color as `backdrop`, with the photo's filter `filter` (the `auto` one is the
   * photo's color through it): what shows on either side of a swipe of the filters.
   */
  readonly backdropOf: (filter: PhotoFilterId | null) => string | null;
  /** Called when a swipe, or an accessibility action, changes the photo's filter (one undo step). */
  readonly onFilterChange: (filter: PhotoFilterId | null) => void;
  /** Id of the selected layer, or `null`. */
  readonly selectedId: string | null;
  /**
   * What is being adjusted on a bar, if anything: the selected layer's size, drawn at
   * `adjustedScale` meanwhile, or its opacity, or the background's, at `adjustedOpacity`, without
   * a render per frame.
   */
  readonly adjusting: 'scale' | 'opacity' | 'background' | null;
  readonly adjustedScale: SharedValue<number>;
  readonly adjustedOpacity: SharedValue<number>;
  readonly onSelect: (id: string | null) => void;
  /**
   * Called on a tap on the layer already selected, at `at` (canvas pixels): a text or a verse is
   * edited, the picture of the window touched changed.
   */
  readonly onTapSelected: (id: string, at: { readonly x: number; readonly y: number }) => void;
  /**
   * Called on a tap that selects a layer, after `onSelect`, at `at` (canvas pixels): a slot's
   * window with no photo asks for one.
   */
  readonly onTapLayer: (id: string, at: { readonly x: number; readonly y: number }) => void;
  /**
   * Called with the selected layer's content size, before scaling, when it changes (`null`: none
   * selected), so the editor knows how far down it reaches.
   */
  readonly onSelectedSizeChange: (size: Size | null) => void;
  /**
   * Called on a tap that hits no layer, on the photo or on the empty canvas, with where it was, as
   * fractions of the canvas.
   */
  readonly onTapPhoto: (at: { readonly x: number; readonly y: number }) => void;
  /** Called when a layer starts and stops being dragged, so the editor can clear the way. */
  readonly onDraggingChange: (dragging: boolean) => void;
  /** Called once per gesture on the photo, when the fingers lift. */
  readonly onPlacementChange: (placement: PhotoPlacement) => void;
  /** Called once per gesture on a layer, when the fingers lift. */
  readonly onLayerTransform: (id: string, transform: LayerTransform) => void;
  /** Called when a layer is dropped on the trash. */
  readonly onLayerRemove: (id: string) => void;
  /** Accessibility label of the trash that appears while dragging a layer. */
  readonly trashLabel: string;
}

// On-screen sizes, in points.
/** Smallest area a finger can grab a layer by, whatever its size (Apple's minimum target). */
const MIN_TOUCH = 44;
/** How close to a center line or an edge a layer snaps to it. */
const SNAP_DISTANCE = 8;
/** How close to straight (0°, 90°…) a layer or the photo snaps, in radians (4°). */
const SNAP_ANGLE = (4 * Math.PI) / 180;
/** How close to covering the canvas the photo's size snaps to it, as a share of its scale. */
const SNAP_SCALE = 0.04;
/** Diameter of the trash and its distance from the bottom of the canvas. */
const TRASH_SIZE = 52;
const TRASH_MARGIN = 20;
/** How far from the trash center the finger still drops on it. */
const TRASH_REACH = 44;

/** What the current gesture moves: decided when it starts, kept until every finger lifts. */
const TARGET_NONE = 0;
const TARGET_PHOTO = 1;
/** A photo of a collage, in its cell. */
const TARGET_CELL = 3;
const TARGET_LAYER = 2;
/** The photo's filters, swiped with one finger (the photo moves with two). */
const TARGET_FILTER = 4;
/**
 * Nothing: a finger on the photo while the swipe before still settles, whose filter isn't on the
 * canvas yet (quick swipes one after another broke the canvas).
 */
const TARGET_IGNORE = 5;

/** How a swipe of the filters goes on to the next one, or back, once the finger lifts. */
const FILTER_SETTLE = {
  duration: 180,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};
/** How long the name of the filter chosen stays in the middle of the canvas, in milliseconds. */
const FILTER_NAME_MS = 900;
/** What a swipe's textures are drawn with: one pixel to one pixel. */
const SIDE_SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.None } as const;

/** Track Red, as a plain string the UI thread can use. */
const ACCENT = colors.tint;

/**
 * How many times the pixels it takes on screen the texture of the widget that moves has: at just as
 * many, its edges saw-toothed as it turned. Twice is sharp, also pinched somewhat bigger.
 */
const LIVE_TEXTURE_SHARPNESS = 2;
/** The largest side of the texture of the widget that moves, in pixels. */
const MAX_LIVE_TEXTURE = 2048;

const IDENTITY: LayerTransform = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };
/** Strong ease-out for UI state changes. */
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const TRASH_TIMING = { duration: 150, easing: EASE_OUT, reduceMotion: ReduceMotion.System };
/** How long each arm of the selected widget's corner marks is, in screen points. */
const CORNER_ARM = 14;

/** Position and rotation of a layer's selection frame (not its scale: the stroke stays thin). */
function frameMatrix(transform: LayerTransform, canvas: Size): Transforms3d {
  'worklet';
  return [
    { translateX: transform.x * canvas.width },
    { translateY: transform.y * canvas.height },
    { rotate: transform.rotation },
  ];
}

/**
 * Path of a layer's selection marks, centered on the frame's origin: only the four corners of the
 * scaled content grown by `LAYER_MARGIN` (the shape edge snapping measures), as a camera's
 * viewfinder, instead of a whole frame (the owner's decision). Each arm is `arm` long, or a third
 * of the side when that is shorter, and the corners are pulled in by `inset` so a stroke of twice
 * that width lies inside the shape.
 */
function frameCorners(
  transform: LayerTransform,
  width: number,
  height: number,
  inset: number,
  arm: number,
) {
  'worklet';
  const grow = LAYER_MARGIN - inset;
  const right = (width * transform.scale) / 2 + grow;
  const bottom = (height * transform.scale) / 2 + grow;
  const across = Math.min(arm, (2 * right) / 3);
  const down = Math.min(arm, (2 * bottom) / 3);
  const builder = Skia.PathBuilder.Make();
  for (const [x, y] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    builder.moveTo(x * right, y * (bottom - down));
    builder.lineTo(x * right, y * bottom);
    builder.lineTo(x * (right - across), y * bottom);
  }
  return builder.detach();
}

/**
 * Position of a snap guide along an axis of `length`. Edge guides are pulled in by `inset`, half
 * their stroke, so their outer edge lies on the canvas edge, where a snapped frame's does too.
 */
function guidePosition(line: SnapLine, length: number, inset: number): number {
  'worklet';
  return line === 'start' ? inset : line === 'end' ? length - inset : length / 2;
}

function playHaptic(style: ImpactFeedbackStyle): void {
  impactAsync(style).catch((error: unknown) => {
    logError('Could not play a haptic', error);
  });
}

/**
 * The template scene scaled down from its 1080 px export size to the screen, edited with the
 * fingers: a tap selects the layer under it (elsewhere it goes to `onTapPhoto`), and dragging,
 * pinching and rotating move whatever is under the fingers when the gesture starts: a layer, or
 * else the photo.
 *
 * Layers snap to the canvas center lines, to its edges and to straight angles, with guides and a
 * haptic tick; dropping one on the trash that appears while dragging removes it. The photo moves
 * freely (see `photo-placement.ts`) and snaps the same way, and to the size that covers the
 * canvas; where it leaves the canvas empty, the background shows.
 *
 * During a gesture the photo's placement and the moved layer's transform live in shared values
 * updated on the UI thread: React doesn't re-render and the other layers aren't redrawn. When
 * the fingers lift, the result goes to `onPlacementChange`, `onLayerTransform` or
 * `onLayerRemove` (one undo step).
 */
export function EditorCanvas({
  displayWidth,
  area,
  template,
  layerContext,
  photo,
  collage,
  frame,
  onCellGrab,
  onCellPlacementChange,
  placement,
  backdrop,
  backdropOf,
  onFilterChange,
  selectedId,
  adjusting,
  adjustedScale,
  adjustedOpacity,
  onSelect,
  onTapSelected,
  onTapLayer,
  onSelectedSizeChange,
  onTapPhoto,
  onDraggingChange,
  onPlacementChange,
  onLayerTransform,
  onLayerRemove,
  trashLabel,
}: EditorCanvasProps) {
  const reducedMotion = useReducedMotion();
  const canvas = CANVAS_FORMATS[template.format];
  const ratio = displayWidth / canvas.width;
  const displayHeight = canvas.height * ratio;
  const photoSize: Size | null =
    photo === null ? null : { width: photo.width(), height: photo.height() };
  const { t } = useTranslation();
  /** The photo's filter, and whether one finger swipes through them: on the canvas's photo, alone. */
  const filter = template.filter ?? null;
  const filtersOn = photo !== null && collage === null;
  const filterPage = Math.max(0, FILTER_PAGES.indexOf(filter));
  const [layerCache] = useState(() => new PreparedLayerCache());
  const layers = layerCache.prepare(template, layerContext);
  const boxes: LayerBox[] = layers.map(({ layer, width, height, hole, line }) => ({
    id: layer.id,
    transform: layer.transform,
    width,
    height,
    ...(hole === undefined ? {} : { hole }),
    ...(line === undefined ? {} : { line }),
  }));
  const selected = boxes.find((box) => box.id === selectedId) ?? null;
  const selectedWidth = selected?.width ?? 0;
  const selectedHeight = selected?.height ?? 0;
  useEffect(() => {
    onSelectedSizeChange(
      selectedId === null ? null : { width: selectedWidth, height: selectedHeight },
    );
  }, [selectedId, selectedWidth, selectedHeight, onSelectedSizeChange]);
  const thresholds = { distance: SNAP_DISTANCE / ratio, rotation: SNAP_ANGLE };
  const photoThresholds = { ...thresholds, scale: SNAP_SCALE };
  // The trash center, in screen points from the canvas's top-left corner.
  const trashX = displayWidth / 2;
  const trashY = displayHeight - TRASH_MARGIN - TRASH_SIZE / 2;

  /**
   * Layer under the fingers, drawn from the shared transform until the gesture ends. Starting and
   * ending a drag is a React update together with the selection or the commit, so the layer
   * never shows a stale transform for a frame.
   */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragged = boxes.find((box) => box.id === draggingId) ?? null;
  const draggedOpacity = layers.find(({ layer }) => layer.id === draggingId)?.layer.opacity ?? 1;
  const startDrag = (id: string) => {
    onSelect(id);
    setDraggingId(id);
    onDraggingChange(true);
  };
  const finishDrag = (id: string, transform: LayerTransform) => {
    onLayerTransform(id, transform);
    setDraggingId(null);
    onDraggingChange(false);
  };
  const dropOnTrash = (id: string) => {
    playHaptic(ImpactFeedbackStyle.Medium);
    onLayerRemove(id);
    onSelect(null);
    setDraggingId(null);
    onDraggingChange(false);
  };
  /**
   * A tap selects the layer under it, or taps it if it already is; elsewhere, it is a tap on the
   * photo.
   */
  const tapAt = (id: string | null, at: { readonly x: number; readonly y: number }) => {
    if (id === null) {
      onTapPhoto({ x: at.x / canvas.width, y: at.y / canvas.height });
    } else if (id === selectedId) {
      onTapSelected(id, at);
    } else {
      onSelect(id);
      onTapLayer(id, at);
    }
  };

  /**
   * The cells of a collage as gestures need them: where each is, and the size and placement of its
   * photo. Plain numbers: they go to the UI thread with the gesture, the images stay here.
   */
  const cellTargets = (collage?.cells ?? []).map((cell, index) => ({
    clip: cell.clip,
    size:
      cell.kind === 'photo'
        ? { width: cell.photo.image.width(), height: cell.photo.image.height() }
        : null,
    placement: template.collage?.placements[index] ?? COVER_PLACEMENT,
  }));
  /**
   * The cell under the fingers, its photo drawn from the shared placement until the gesture ends;
   * as with a layer, the end is one React update with the commit, so no stale frame shows.
   */
  const [movingPhoto, setMovingPhoto] = useState(false);
  const startPhotoMove = () => setMovingPhoto(true);
  const finishPhotoMove = (moved: PhotoPlacement) => {
    onPlacementChange(moved);
    setMovingPhoto(false);
  };
  const [movingCell, setMovingCell] = useState<number | null>(null);
  const startCellMove = (cell: number) => {
    setMovingCell(cell);
    onCellGrab(cell);
  };
  const finishCellMove = (cell: number, moved: PhotoPlacement) => {
    onCellPlacementChange(cell, moved);
    setMovingCell(null);
  };
  /**
   * A swipe of the photo's filters: while it lasts, the photo with the filters on either side is
   * drawn into textures, and the one the finger brings in shows beside the current one, cut where
   * the finger is (as on Instagram). Ending it is one React update with the new filter, so no frame
   * shows the old one.
   */
  const [filterSwipe, setFilterSwipe] = useState(false);
  /** The name of the filter just chosen, shown a moment in the middle of the canvas. */
  const [filterName, setFilterName] = useState<{
    readonly id: number;
    readonly filter: PhotoFilterId | null;
  } | null>(null);
  const shownNameId = filterName?.id;
  useEffect(() => {
    if (shownNameId === undefined) {
      return undefined;
    }
    const timer = setTimeout(() => setFilterName(null), FILTER_NAME_MS);
    return () => clearTimeout(timer);
  }, [shownNameId]);
  const chooseFilter = (next: PhotoFilterId | null) => {
    if (next === filter) {
      return;
    }
    onFilterChange(next);
    playHaptic(ImpactFeedbackStyle.Light);
    setFilterName((current) => ({ id: (current?.id ?? 0) + 1, filter: next }));
  };
  /** A filter's name, as the user reads it. */
  const filterLabel = (shown: PhotoFilterId | null) =>
    t(shown === null ? 'filters.none' : `filters.${shown}`);
  const startFilterSwipe = () => setFilterSwipe(true);
  const finishFilterSwipe = (page: number) => {
    chooseFilter(FILTER_PAGES[page] ?? null);
    setFilterSwipe(false);
    // Its filter is the canvas's from now on, the same one if it went back: the next swipe starts
    // from it.
    shownPage.set(page);
    filterSettling.set(false);
  };

  const activeGestures = useSharedValue(0);
  const target = useSharedValue(TARGET_NONE);
  const targetId = useSharedValue('');
  const touchStart = useSharedValue({ x: 0, y: 0 });
  /** Where the fingers put the photo; `livePlacement` is that, snapped. */
  const rawPlacement = useSharedValue(placement);
  const livePlacement = useSharedValue(placement);
  const photoStraight = useSharedValue(false);
  const photoCover = useSharedValue(false);
  /** The same for the photo of the cell being moved, and where it is and how big. */
  const rawCellPlacement = useSharedValue(COVER_PLACEMENT);
  const liveCellPlacement = useSharedValue(COVER_PLACEMENT);
  const movingIndex = useSharedValue(0);
  const movingBox = useSharedValue<{ readonly size: Size; readonly rect: DrawRect } | null>(null);
  /** What the snap guides run along: the canvas, or the cell being moved. */
  const guideBox = useSharedValue<DrawRect>({ x: 0, y: 0, ...canvas });
  /** Where the fingers put the layer; `liveTransform` is that, snapped. */
  const rawTransform = useSharedValue<LayerTransform>(IDENTITY);
  const liveTransform = useSharedValue<LayerTransform>(IDENTITY);
  const snapX = useSharedValue<SnapLine>('none');
  const snapY = useSharedValue<SnapLine>('none');
  const layerStraight = useSharedValue(false);
  const overTrash = useSharedValue(false);
  /** 0 → 1 as the finger reaches the trash, animated. */
  const trashProgress = useSharedValue(0);
  /** A swipe of the filters: the finger's way and speed, and where the cut shows (screen points). */
  const filterDx = useSharedValue(0);
  const filterVelocity = useSharedValue(0);
  const filterOffset = useSharedValue(0);
  /**
   * The page of the filter on the canvas, as the UI thread knows it, and whether a swipe still
   * settles (from the finger lifting until its filter is on the canvas): a swipe starts from the
   * filter the canvas shows, never from one a swipe just before is still bringing in.
   */
  const shownPage = useSharedValue(filterPage);
  const filterSettling = useSharedValue(false);
  useEffect(() => {
    // Once the filter a swipe chose is on the canvas (or undo, redo or a design changed it).
    shownPage.set(filterPage);
    filterSettling.set(false);
  }, [filterPage, filter, shownPage, filterSettling]);

  // Undo, redo or a new photo place it from outside; never mid-gesture, where the shared value
  // is ahead of React.
  useEffect(() => {
    if (activeGestures.get() === 0) {
      livePlacement.set(placement);
    }
  }, [placement, livePlacement, activeGestures]);

  const drawing = useDerivedValue((): PhotoDrawing =>
    photoSize === null
      ? { x: 0, y: 0, width: 0, height: 0, rotation: 0 }
      : drawPhoto(photoSize, canvas, livePlacement.get()),
  );
  const livePhotoMatrix = useDerivedValue(() => photoMatrix(drawing.get()));
  const livePhotoRect = useDerivedValue(() => photoRect(drawing.get()));
  const cellDrawing = useDerivedValue((): PhotoDrawing => {
    const box = movingBox.get();
    return box === null
      ? { x: 0, y: 0, width: 0, height: 0, rotation: 0 }
      : drawInCell(box.size, box.rect, liveCellPlacement.get());
  });
  const liveCellMatrix = useDerivedValue(() => photoMatrix(cellDrawing.get()));
  const liveCellRect = useDerivedValue(() => photoRect(cellDrawing.get()));
  const liveMatrix = useDerivedValue(() => layerMatrix(liveTransform.get(), canvas));
  // The dragged layer fades over the trash: it is about to go.
  const liveOpacity = useDerivedValue(() => draggedOpacity * (1 - 0.65 * trashProgress.get()));

  const resetSnaps = () => {
    'worklet';
    snapX.set('none');
    snapY.set('none');
    layerStraight.set(false);
    photoStraight.set(false);
    photoCover.set(false);
    overTrash.set(false);
    trashProgress.set(0);
  };

  /**
   * Picks what the gesture moves from where it started (canvas pixels) and with how many fingers:
   * on the photo, one swipes its filters (where it takes them) and two move it.
   */
  const chooseTarget = (point: { x: number; y: number }, pointers: number) => {
    'worklet';
    if (target.get() !== TARGET_NONE) {
      // A second simultaneous gesture keeps what the first one took: a second finger on a swipe
      // of the filters leaves it a swipe (in quick swipes the next finger often lands before the
      // last lifts, and the photo jumped between them).
      return;
    }
    resetSnaps();
    const id = hitTestLayers(boxes, point, canvas, MIN_TOUCH / ratio);
    const box = id === null ? undefined : boxes.find((candidate) => candidate.id === id);
    guideBox.set({ x: 0, y: 0, ...canvas });
    if (box === undefined) {
      const index = cellTargets.findIndex(
        ({ clip }) =>
          point.x >= clip.x &&
          point.x < clip.x + clip.width &&
          point.y >= clip.y &&
          point.y < clip.y + clip.height,
      );
      const cell = index < 0 ? undefined : cellTargets[index];
      if (cell !== undefined && cell.size !== null) {
        target.set(TARGET_CELL);
        movingIndex.set(index);
        movingBox.set({ size: cell.size, rect: cell.clip });
        guideBox.set(cell.clip);
        rawCellPlacement.set(cell.placement);
        liveCellPlacement.set(cell.placement);
        scheduleOnRN(startCellMove, index);
        return;
      }
      if (filtersOn && pointers < 2 && filterSettling.get()) {
        target.set(TARGET_IGNORE);
        return;
      }
      if (filtersOn && pointers < 2) {
        target.set(TARGET_FILTER);
        filterDx.set(0);
        filterVelocity.set(0);
        filterOffset.set(0);
        scheduleOnRN(startFilterSwipe);
        return;
      }
      target.set(TARGET_PHOTO);
      rawPlacement.set(livePlacement.get());
      if (photoSize !== null) {
        scheduleOnRN(startPhotoMove);
      }
      return;
    }
    target.set(TARGET_LAYER);
    targetId.set(box.id);
    rawTransform.set(box.transform);
    liveTransform.set(box.transform);
    scheduleOnRN(startDrag, box.id);
  };

  /** Moves the target layer to `next` (unsnapped), snapping it and ticking on each new snap. */
  const updateLayer = (next: LayerTransform) => {
    'worklet';
    rawTransform.set(next);
    const box = boxes.find((candidate) => candidate.id === targetId.get());
    if (box === undefined) {
      liveTransform.set(next);
      return;
    }
    const snap = snapLayer(next, box, canvas, thresholds, LAYER_MARGIN);
    const newSnap =
      (snap.x !== 'none' && snap.x !== snapX.get()) ||
      (snap.y !== 'none' && snap.y !== snapY.get()) ||
      (snap.rotation && !layerStraight.get());
    snapX.set(snap.x);
    snapY.set(snap.y);
    layerStraight.set(snap.rotation);
    liveTransform.set(snap.transform);
    if (newSnap) {
      scheduleOnRN(playHaptic, ImpactFeedbackStyle.Light);
    }
  };

  /** `next` (unsnapped) for a photo of size `size` on `area`, snapped, ticking on each new snap. */
  const snapMoved = (next: PhotoPlacement, size: Size, area: Size): PhotoPlacement => {
    'worklet';
    const snap = snapPlacement(next, size, area, photoThresholds);
    const newSnap =
      (snap.x !== 'none' && snap.x !== snapX.get()) ||
      (snap.y !== 'none' && snap.y !== snapY.get()) ||
      (snap.rotation && !photoStraight.get()) ||
      (snap.cover && !photoCover.get());
    snapX.set(snap.x);
    snapY.set(snap.y);
    photoStraight.set(snap.rotation);
    photoCover.set(snap.cover);
    if (newSnap) {
      scheduleOnRN(playHaptic, ImpactFeedbackStyle.Light);
    }
    return snap.placement;
  };

  /** Moves the photo to `next` (unsnapped). */
  const updatePhoto = (next: PhotoPlacement) => {
    'worklet';
    if (photoSize === null) {
      return;
    }
    rawPlacement.set(next);
    livePlacement.set(snapMoved(next, photoSize, canvas));
  };

  /** Moves the photo of the cell being moved to `next` (unsnapped), inside its cell. */
  const updateCell = (next: PhotoPlacement) => {
    'worklet';
    const box = movingBox.get();
    if (box === null) {
      return;
    }
    rawCellPlacement.set(next);
    liveCellPlacement.set(snapMoved(next, box.size, box.rect));
  };

  /** Tracks whether the finger (screen points) is over the trash, ticking when it gets there. */
  const trackTrash = (x: number, y: number) => {
    'worklet';
    const over = Math.hypot(x - trashX, y - trashY) <= TRASH_REACH;
    if (over === overTrash.get()) {
      return;
    }
    if (over) {
      scheduleOnRN(playHaptic, ImpactFeedbackStyle.Light);
    }
    overTrash.set(over);
    trashProgress.set(withTiming(over ? 1 : 0, TRASH_TIMING));
  };

  const startGesture = () => {
    'worklet';
    activeGestures.set(activeGestures.get() + 1);
  };

  /** Commits the result once the last simultaneous gesture ends. */
  const endGesture = () => {
    'worklet';
    const remaining = activeGestures.get() - 1;
    activeGestures.set(remaining);
    if (remaining > 0) {
      return;
    }
    if (target.get() === TARGET_CELL) {
      scheduleOnRN(finishCellMove, movingIndex.get(), liveCellPlacement.get());
    } else if (target.get() === TARGET_PHOTO && photoSize !== null) {
      scheduleOnRN(finishPhotoMove, livePlacement.get());
    } else if (target.get() === TARGET_FILTER) {
      const from = shownPage.get();
      const offset = filterOffset.get();
      const page = pageAfterSwipe(
        from,
        offset,
        filterVelocity.get(),
        displayWidth,
        FILTER_PAGES.length,
      );
      // On to the edge the new one comes from, or back; no swipe starts until it is on the canvas
      // (see `TARGET_IGNORE`), so nothing cuts this short.
      const to = page === from ? 0 : offset < 0 ? -displayWidth : displayWidth;
      filterSettling.set(true);
      filterOffset.set(withTiming(to, FILTER_SETTLE, () => scheduleOnRN(finishFilterSwipe, page)));
    } else if (target.get() === TARGET_LAYER) {
      if (overTrash.get()) {
        scheduleOnRN(dropOnTrash, targetId.get());
      } else {
        scheduleOnRN(finishDrag, targetId.get(), liveTransform.get());
      }
    }
    target.set(TARGET_NONE);
    resetSnaps();
  };

  const pan = usePanGesture({
    // Android follows the first finger by default; iOS and this follow the fingers' centroid.
    averageTouches: true,
    onBegin: (event) => {
      touchStart.set({ x: event.x / ratio, y: event.y / ratio });
    },
    onActivate: (event) => {
      // Where the finger went down, not where it was once it had moved enough to start.
      chooseTarget(touchStart.get(), event.numberOfPointers);
      startGesture();
    },
    onUpdate: (event) => {
      const dx = event.changeX / ratio;
      const dy = event.changeY / ratio;
      if (target.get() === TARGET_FILTER) {
        // One finger's way: with two, their middle jumps as the second lands or the first lifts.
        if (event.numberOfPointers === 1) {
          filterDx.set(filterDx.get() + event.changeX);
          filterVelocity.set(event.velocityX);
          filterOffset.set(swipeOffset(filterDx.get(), displayWidth));
        }
      } else if (target.get() === TARGET_LAYER) {
        updateLayer(translateLayer(rawTransform.get(), canvas, dx, dy));
        trackTrash(event.x, event.y);
      } else if (target.get() === TARGET_CELL) {
        updateCell(panPlacement(rawCellPlacement.get(), guideBox.get(), dx, dy));
      } else if (target.get() === TARGET_PHOTO) {
        updatePhoto(panPlacement(rawPlacement.get(), canvas, dx, dy));
      }
    },
    onDeactivate: endGesture,
  });

  const pinch = usePinchGesture({
    onActivate: (event) => {
      chooseTarget({ x: event.focalX / ratio, y: event.focalY / ratio }, 2);
      startGesture();
    },
    onUpdate: (event) => {
      // The first event of some devices carries no scale yet.
      if (!(event.scaleChange > 0)) {
        return;
      }
      if (target.get() === TARGET_LAYER) {
        updateLayer(scaleLayer(rawTransform.get(), event.scaleChange));
      } else if (target.get() === TARGET_CELL) {
        const box = guideBox.get();
        updateCell(
          zoomPlacement(rawCellPlacement.get(), box, event.scaleChange, {
            x: event.focalX / ratio - box.x,
            y: event.focalY / ratio - box.y,
          }),
        );
      } else if (target.get() === TARGET_PHOTO) {
        updatePhoto(
          zoomPlacement(rawPlacement.get(), canvas, event.scaleChange, {
            x: event.focalX / ratio,
            y: event.focalY / ratio,
          }),
        );
      }
    },
    onDeactivate: endGesture,
  });

  const rotation = useRotationGesture({
    onActivate: (event) => {
      chooseTarget({ x: event.anchorX / ratio, y: event.anchorY / ratio }, 2);
      startGesture();
    },
    onUpdate: (event) => {
      if (target.get() === TARGET_LAYER) {
        updateLayer(rotateLayer(rawTransform.get(), event.rotationChange));
      } else if (target.get() === TARGET_CELL) {
        updateCell(rotatePlacement(rawCellPlacement.get(), event.rotationChange));
      } else if (target.get() === TARGET_PHOTO) {
        updatePhoto(rotatePlacement(rawPlacement.get(), event.rotationChange));
      }
    },
    onDeactivate: endGesture,
  });

  const tap = useTapGesture({
    onDeactivate: (event) => {
      if (!event.canceled) {
        const point = { x: event.x / ratio, y: event.y / ratio };
        scheduleOnRN(tapAt, hitTestLayers(boxes, point, canvas, MIN_TOUCH / ratio), point);
      }
    },
  });

  // Dragging, pinching and rotating go together; a tap only when none of them started.
  const gesture = useCompetingGestures(useSimultaneousGestures(pan, pinch, rotation), tap);

  // Strokes in screen points, whatever the canvas scale.
  const hairline = 1 / ratio;
  const frameStroke = 4 * hairline;
  const guideStroke = 2 * hairline;

  // Selection marks: the corners of the layer plus its margin (what snaps to the edges), drawn
  // inside that shape; they follow the fingers while the selected layer is dragged.
  const frameInset = frameStroke / 2;
  const frameArm = CORNER_ARM * hairline;
  const liveFrameMatrix = useDerivedValue(() => frameMatrix(liveTransform.get(), canvas));
  const liveFramePath = useDerivedValue(() =>
    frameCorners(
      liveTransform.get(),
      dragged?.width ?? 0,
      dragged?.height ?? 0,
      frameInset,
      frameArm,
    ),
  );
  // The selected layer at the size slider's scale, or the opacity bar's, while one is dragged.
  const selectedTransform = selected?.transform ?? IDENTITY;
  const selectedOpacity = layers.find(({ layer }) => layer.id === selectedId)?.layer.opacity ?? 1;
  const resizedTransform = useDerivedValue((): LayerTransform =>
    adjusting === 'scale'
      ? { ...selectedTransform, scale: adjustedScale.get() }
      : selectedTransform,
  );
  const resizedMatrix = useDerivedValue(() => layerMatrix(resizedTransform.get(), canvas));
  const resizedOpacity = useDerivedValue(() =>
    adjusting === 'opacity' ? adjustedOpacity.get() : selectedOpacity,
  );
  const resizedFrameMatrix = useDerivedValue(() => frameMatrix(resizedTransform.get(), canvas));
  const resizedFramePath = useDerivedValue(() =>
    frameCorners(resizedTransform.get(), selectedWidth, selectedHeight, frameInset, frameArm),
  );
  const resized =
    (adjusting === 'scale' || adjusting === 'opacity') && draggingId === null ? selected : null;
  // The background's color, at its own opacity or the bar's while it moves.
  const background = backdrop === null ? null : splitOpacity(backdrop);
  const backgroundOpacity = background?.opacity ?? 1;
  const liveBackgroundOpacity = useDerivedValue(() =>
    adjusting === 'background' ? adjustedOpacity.get() : backgroundOpacity,
  );

  const selectionFrame =
    selected === null
      ? null
      : selected.id === draggingId
        ? { matrix: liveFrameMatrix, path: liveFramePath }
        : selected === resized
          ? { matrix: resizedFrameMatrix, path: resizedFramePath }
          : {
              matrix: frameMatrix(selected.transform, canvas),
              path: frameCorners(
                selected.transform,
                selected.width,
                selected.height,
                frameInset,
                frameArm,
              ),
            };

  // What moves is drawn from textures for as long as the gesture lasts (see useGestureTextures).
  const pixelRatio = PixelRatio.get();
  const sceneSize = {
    width: Math.round(displayWidth * pixelRatio),
    height: Math.round(displayHeight * pixelRatio),
  };
  /** The rectangle of the scene a texture of the whole canvas covers, one pixel to one pixel. */
  const sceneRect = {
    x: 0,
    y: 0,
    width: sceneSize.width / (ratio * pixelRatio),
    height: sceneSize.height / (ratio * pixelRatio),
  };
  const stillBackdrop =
    background === null
      ? ({ kind: 'checker' } as const)
      : ({ kind: 'color', color: background.hex, onChecker: true } as const);
  const stillScene = (children: ReactElement) => (
    <Group transform={[{ scale: ratio * pixelRatio }]}>{children}</Group>
  );
  const movingLayerId = draggingId ?? resized?.id ?? null;
  const movingLayer = layers.findIndex(({ layer }) => layer.id === movingLayerId);
  const textureRequest = ((): TextureRequest | null => {
    if (movingLayer >= 0) {
      const { layer, content, width, height } = layers[movingLayer];
      const clip = layerClip(width, height);
      const scale = Math.min(
        layer.transform.scale * ratio * pixelRatio * LIVE_TEXTURE_SHARPNESS,
        MAX_LIVE_TEXTURE / Math.max(clip.width, clip.height),
      );
      const above = layers.slice(movingLayer + 1);
      return {
        key: `layer ${layer.id}`,
        sceneSize,
        under: stillScene(
          <TemplateScene
            format={template.format}
            layers={layers.slice(0, movingLayer)}
            backdrop={stillBackdrop}
            photo={
              photo === null || photoSize === null
                ? null
                : {
                    image: photo,
                    matrix: photoMatrix(drawPhoto(photoSize, canvas, placement)),
                    rect: photoRect(drawPhoto(photoSize, canvas, placement)),
                    filter,
                  }
            }
            collage={collage}
            frame={frame}
          />,
        ),
        over:
          above.length === 0
            ? null
            : stillScene(
                <TemplateScene
                  format={template.format}
                  layers={above}
                  backdrop={{ kind: 'none' }}
                  photo={null}
                />,
              ),
        live: {
          element: (
            <Group transform={[{ scale }, { translateX: -clip.x }, { translateY: -clip.y }]}>
              {content}
            </Group>
          ),
          size: {
            width: Math.max(1, Math.round(clip.width * scale)),
            height: Math.max(1, Math.round(clip.height * scale)),
          },
        },
      };
    }
    if (filterSwipe && photo !== null && photoSize !== null) {
      const drawn = drawPhoto(photoSize, canvas, placement);
      /** The backdrop and the photo with `shown` filter, as the canvas draws them. */
      const photoScene = (shown: PhotoFilterId | null) => {
        // With its opacity in it (`#RRGGBBAA`), which Skia reads.
        const color = backdropOf(shown);
        return stillScene(
          <TemplateScene
            format={template.format}
            layers={[]}
            backdrop={
              color === null ? { kind: 'checker' } : { kind: 'color', color, onChecker: true }
            }
            photo={{
              image: photo,
              matrix: photoMatrix(drawn),
              rect: photoRect(drawn),
              filter: shown,
            }}
            frame={frame}
          />,
        );
      };
      return {
        // Drawn again for each filter on the canvas: the sides go with it.
        key: `filter ${filterPage}`,
        sceneSize,
        under: photoScene(filter),
        over:
          layers.length === 0
            ? null
            : stillScene(
                <TemplateScene
                  format={template.format}
                  layers={layers}
                  backdrop={{ kind: 'none' }}
                  photo={null}
                />,
              ),
        live: null,
        sides: {
          before: photoScene(FILTER_PAGES[pageBeside(filterPage, -1, FILTER_PAGES.length)] ?? null),
          after: photoScene(FILTER_PAGES[pageBeside(filterPage, 1, FILTER_PAGES.length)] ?? null),
        },
      };
    }
    if (movingPhoto || movingCell !== null || adjusting === 'background') {
      return {
        key: movingCell !== null ? 'cell' : movingPhoto ? 'photo' : 'background',
        sceneSize,
        under: null,
        over:
          layers.length === 0
            ? null
            : stillScene(
                <TemplateScene
                  format={template.format}
                  layers={layers}
                  backdrop={{ kind: 'none' }}
                  photo={null}
                />,
              ),
        live: null,
      };
    }
    return null;
  })();
  const gestureTextures = useGestureTextures(textureRequest);
  const textures: SceneTextures | null =
    textureRequest === null || gestureTextures.readyKey !== textureRequest.key
      ? null
      : {
          under:
            textureRequest.under === null
              ? null
              : { image: gestureTextures.under, rect: sceneRect },
          over:
            textureRequest.over === null ? null : { image: gestureTextures.over, rect: sceneRect },
          live:
            movingLayer < 0
              ? null
              : {
                  image: gestureTextures.live,
                  rect: layerClip(layers[movingLayer].width, layers[movingLayer].height),
                },
        };

  // A swipe of the filters: the photo with the filter coming in, over the current one from where the
  // finger is to the edge it comes from, and the widgets over it, from the swipe's textures.
  const swiping = filterSwipe && gestureTextures.readyKey === `filter ${filterPage}`;
  const revealRect = useDerivedValue((): DrawRect => {
    const offset = filterOffset.get() / ratio;
    return offset < 0
      ? { x: canvas.width + offset, y: 0, width: -offset, height: canvas.height }
      : { x: 0, y: 0, width: offset, height: canvas.height };
  });
  const sideImage = useDerivedValue(() =>
    filterOffset.get() < 0 ? gestureTextures.after.get() : gestureTextures.before.get(),
  );

  // Snap guides: a vertical line at the left edge, center or right edge, a horizontal one at the
  // top, center or bottom; hidden while not snapped.
  const verticalGuideX = useDerivedValue(
    () => guideBox.get().x + guidePosition(snapX.get(), guideBox.get().width, guideStroke / 2),
  );
  const verticalP1 = useDerivedValue(() => ({ x: verticalGuideX.get(), y: guideBox.get().y }));
  const verticalP2 = useDerivedValue(() => ({
    x: verticalGuideX.get(),
    y: guideBox.get().y + guideBox.get().height,
  }));
  const verticalOpacity = useDerivedValue(() => (snapX.get() === 'none' ? 0 : 1));
  const horizontalGuideY = useDerivedValue(
    () => guideBox.get().y + guidePosition(snapY.get(), guideBox.get().height, guideStroke / 2),
  );
  const horizontalP1 = useDerivedValue(() => ({ x: guideBox.get().x, y: horizontalGuideY.get() }));
  const horizontalP2 = useDerivedValue(() => ({
    x: guideBox.get().x + guideBox.get().width,
    y: horizontalGuideY.get(),
  }));
  const horizontalOpacity = useDerivedValue(() => (snapY.get() === 'none' ? 0 : 1));

  const trashStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(trashProgress.get(), [0, 1], ['rgba(0, 0, 0, 0.45)', ACCENT]),
    transform: [{ scale: reducedMotion ? 1 : 1 + 0.2 * trashProgress.get() }],
  }));

  // The canvas's top-left corner in its area, where the scene is drawn and touched.
  const left = (area.width - displayWidth) / 2;
  const top = (area.height - displayHeight) / 2;
  return (
    <View style={{ width: area.width, height: area.height }}>
      <Canvas
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, top: 0, width: area.width, height: area.height }}
      >
        <Group clip={{ x: left, y: top, width: displayWidth, height: displayHeight }}>
          <Group transform={[{ translateX: left }, { translateY: top }, { scale: ratio }]}>
            <TemplateScene
              format={template.format}
              layers={layers}
              backdrop={
                background === null
                  ? { kind: 'checker' }
                  : {
                      kind: 'color',
                      color: background.hex,
                      opacity: liveBackgroundOpacity,
                      onChecker: true,
                    }
              }
              photo={
                photo === null
                  ? null
                  : { image: photo, matrix: livePhotoMatrix, rect: livePhotoRect, filter }
              }
              frame={frame}
              collage={
                collage === null || movingCell === null
                  ? collage
                  : {
                      ...collage,
                      // The photo under the fingers, drawn from the shared placement.
                      cells: collage.cells.map((cell, index) =>
                        index === movingCell && cell.kind === 'photo'
                          ? {
                              ...cell,
                              photo: {
                                image: cell.photo.image,
                                matrix: liveCellMatrix,
                                rect: liveCellRect,
                              },
                            }
                          : cell,
                      ),
                    }
              }
              live={
                draggingId !== null
                  ? { id: draggingId, matrix: liveMatrix, opacity: liveOpacity }
                  : resized !== null
                    ? { id: resized.id, matrix: resizedMatrix, opacity: resizedOpacity }
                    : null
              }
              textures={textures}
            />
            {swiping ? (
              <Group clip={revealRect}>
                <Image image={sideImage} rect={sceneRect} fit="fill" sampling={SIDE_SAMPLING} />
                {layers.length === 0 ? null : (
                  <Image
                    image={gestureTextures.over}
                    rect={sceneRect}
                    fit="fill"
                    sampling={SIDE_SAMPLING}
                  />
                )}
              </Group>
            ) : null}
            <Line
              p1={verticalP1}
              p2={verticalP2}
              color={ACCENT}
              strokeWidth={guideStroke}
              opacity={verticalOpacity}
            />
            <Line
              p1={horizontalP1}
              p2={horizontalP2}
              color={ACCENT}
              strokeWidth={guideStroke}
              opacity={horizontalOpacity}
            />
            {selectionFrame === null ? null : (
              <Group transform={selectionFrame.matrix}>
                {/* A dark edge under the white line keeps the corners visible on light photos. */}
                <Path
                  path={selectionFrame.path}
                  style="stroke"
                  strokeWidth={frameStroke}
                  strokeCap="round"
                  strokeJoin="round"
                  color="rgba(0, 0, 0, 0.35)"
                />
                <Path
                  path={selectionFrame.path}
                  style="stroke"
                  strokeWidth={2 * hairline}
                  strokeCap="round"
                  strokeJoin="round"
                  color="#FFFFFF"
                />
              </Group>
            )}
          </Group>
        </Group>
      </Canvas>
      {/* Around the canvas (a wide format leaves room over and under it), a tap lets go of the
          selected widget (the user's choice). */}
      <Pressable
        accessible={false}
        style={{ position: 'absolute', left: 0, top: 0, width: area.width, height: area.height }}
        onPress={() => onSelect(null)}
      />
      <GestureDetector gesture={gesture}>
        {/* Kept as a view of its own: an empty one would be flattened away. Where the photo takes
            filters, screen readers change them as an adjustable value, a swipe each. */}
        <View
          collapsable={false}
          accessible={filtersOn}
          accessibilityRole={filtersOn ? 'adjustable' : undefined}
          accessibilityLabel={filtersOn ? t('filters.label') : undefined}
          accessibilityValue={filtersOn ? { text: filterLabel(filter) } : undefined}
          accessibilityActions={
            filtersOn ? [{ name: 'increment' }, { name: 'decrement' }] : undefined
          }
          onAccessibilityAction={(event) => {
            const step = event.nativeEvent.actionName === 'increment' ? 1 : -1;
            chooseFilter(FILTER_PAGES[pageBeside(filterPage, step, FILTER_PAGES.length)] ?? null);
          }}
          style={{ position: 'absolute', left, top, width: displayWidth, height: displayHeight }}
        />
      </GestureDetector>
      {filterName === null ? null : (
        <Animated.View
          key={filterName.id}
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(250)}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left,
            top,
            width: displayWidth,
            height: displayHeight,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            importantForAccessibility="no"
            style={{
              color: '#FFFFFF',
              fontSize: 30,
              fontWeight: '600',
              textShadowColor: 'rgba(0, 0, 0, 0.45)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 6,
            }}
          >
            {filterLabel(filterName.filter)}
          </Text>
        </Animated.View>
      )}
      {draggingId === null ? null : (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          pointerEvents="none"
          accessibilityLabel={trashLabel}
          style={[
            {
              position: 'absolute',
              left: left + trashX - TRASH_SIZE / 2,
              top: top + trashY - TRASH_SIZE / 2,
              width: TRASH_SIZE,
              height: TRASH_SIZE,
              borderRadius: TRASH_SIZE / 2,
              alignItems: 'center',
              justifyContent: 'center',
            },
            trashStyle,
          ]}
        >
          <AppIcon name="trash" size={24} color="#FFFFFF" />
        </Animated.View>
      )}
    </View>
  );
}
