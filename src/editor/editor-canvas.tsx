import {
  Canvas,
  Group,
  Line,
  RoundedRect,
  Skia,
  type SkImage,
  type Transforms3d,
} from '@shopify/react-native-skia';
import { ImpactFeedbackStyle, impactAsync } from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
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
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

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
import {
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
import { logError } from '@/ui/log';

import {
  type LayerContext,
  layerMatrix,
  photoMatrix,
  photoRect,
  prepareLayers,
  TemplateScene,
} from './template-scene';

interface EditorCanvasProps {
  /** On-screen width; the height follows the template format. */
  readonly displayWidth: number;
  readonly template: Template;
  readonly layerContext: LayerContext;
  /** The photo, or `null` for none. */
  readonly photo: SkImage | null;
  /** Where the photo goes; the template's own, kept apart so gestures can move it live. */
  readonly placement: PhotoPlacement;
  /** The background's color where the photo leaves the canvas empty; `null` shows none. */
  readonly backdrop: string | null;
  /** Id of the selected layer, or `null`. */
  readonly selectedId: string | null;
  readonly onSelect: (id: string | null) => void;
  /** Called on a tap that hits no layer: on the photo, or on the empty canvas. */
  readonly onTapPhoto: () => void;
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
const TARGET_LAYER = 2;

/** Track Red, as a plain string the UI thread can use. */
const ACCENT = colors.tint;

const IDENTITY: LayerTransform = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };
/** Strong ease-out for UI state changes. */
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const TRASH_TIMING = { duration: 150, easing: EASE_OUT, reduceMotion: ReduceMotion.System };

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
 * Path of a layer's selection frame, centered on the frame's origin: the scaled content grown by
 * `LAYER_MARGIN` with corners of that radius (the shape edge snapping measures), pulled in by
 * `inset` so a stroke of twice that width lies inside it, its outer edge on the frame's.
 */
function frameRect(transform: LayerTransform, width: number, height: number, inset: number) {
  'worklet';
  const grow = LAYER_MARGIN - inset;
  const frameWidth = width * transform.scale + 2 * grow;
  const frameHeight = height * transform.scale + 2 * grow;
  return Skia.RRectXY(
    Skia.XYWHRect(-frameWidth / 2, -frameHeight / 2, frameWidth, frameHeight),
    grow,
    grow,
  );
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
  template,
  layerContext,
  photo,
  placement,
  backdrop,
  selectedId,
  onSelect,
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
  const layers = prepareLayers(template, layerContext);
  const boxes: LayerBox[] = layers.map(({ layer, width, height, hole, line }) => ({
    id: layer.id,
    transform: layer.transform,
    width,
    height,
    ...(hole === undefined ? {} : { hole }),
    ...(line === undefined ? {} : { line }),
  }));
  const selected = boxes.find((box) => box.id === selectedId) ?? null;
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
  /** A tap selects the layer under it; elsewhere, it is a tap on the photo. */
  const tapAt = (id: string | null) => {
    if (id === null) {
      onTapPhoto();
    } else {
      onSelect(id);
    }
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
  /** Where the fingers put the layer; `liveTransform` is that, snapped. */
  const rawTransform = useSharedValue<LayerTransform>(IDENTITY);
  const liveTransform = useSharedValue<LayerTransform>(IDENTITY);
  const snapX = useSharedValue<SnapLine>('none');
  const snapY = useSharedValue<SnapLine>('none');
  const layerStraight = useSharedValue(false);
  const overTrash = useSharedValue(false);
  /** 0 → 1 as the finger reaches the trash, animated. */
  const trashProgress = useSharedValue(0);

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

  /** Picks what the gesture moves from where it started (canvas pixels). */
  const chooseTarget = (point: { x: number; y: number }) => {
    'worklet';
    if (target.get() !== TARGET_NONE) {
      // A second simultaneous gesture keeps what the first one took.
      return;
    }
    resetSnaps();
    const id = hitTestLayers(boxes, point, canvas, MIN_TOUCH / ratio);
    const box = id === null ? undefined : boxes.find((candidate) => candidate.id === id);
    if (box === undefined) {
      target.set(TARGET_PHOTO);
      rawPlacement.set(livePlacement.get());
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

  /** Moves the photo to `next` (unsnapped), snapping it and ticking on each new snap. */
  const updatePhoto = (next: PhotoPlacement) => {
    'worklet';
    if (photoSize === null) {
      return;
    }
    rawPlacement.set(next);
    const snap = snapPlacement(next, photoSize, canvas, photoThresholds);
    const newSnap =
      (snap.x !== 'none' && snap.x !== snapX.get()) ||
      (snap.y !== 'none' && snap.y !== snapY.get()) ||
      (snap.rotation && !photoStraight.get()) ||
      (snap.cover && !photoCover.get());
    snapX.set(snap.x);
    snapY.set(snap.y);
    photoStraight.set(snap.rotation);
    photoCover.set(snap.cover);
    livePlacement.set(snap.placement);
    if (newSnap) {
      scheduleOnRN(playHaptic, ImpactFeedbackStyle.Light);
    }
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
    if (target.get() === TARGET_PHOTO && photoSize !== null) {
      scheduleOnRN(onPlacementChange, livePlacement.get());
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
    onActivate: () => {
      // Where the finger went down, not where it was once it had moved enough to start.
      chooseTarget(touchStart.get());
      startGesture();
    },
    onUpdate: (event) => {
      const dx = event.changeX / ratio;
      const dy = event.changeY / ratio;
      if (target.get() === TARGET_LAYER) {
        updateLayer(translateLayer(rawTransform.get(), canvas, dx, dy));
        trackTrash(event.x, event.y);
      } else {
        updatePhoto(panPlacement(rawPlacement.get(), canvas, dx, dy));
      }
    },
    onDeactivate: endGesture,
  });

  const pinch = usePinchGesture({
    onActivate: (event) => {
      chooseTarget({ x: event.focalX / ratio, y: event.focalY / ratio });
      startGesture();
    },
    onUpdate: (event) => {
      // The first event of some devices carries no scale yet.
      if (!(event.scaleChange > 0)) {
        return;
      }
      if (target.get() === TARGET_LAYER) {
        updateLayer(scaleLayer(rawTransform.get(), event.scaleChange));
      } else {
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
      chooseTarget({ x: event.anchorX / ratio, y: event.anchorY / ratio });
      startGesture();
    },
    onUpdate: (event) => {
      if (target.get() === TARGET_LAYER) {
        updateLayer(rotateLayer(rawTransform.get(), event.rotationChange));
      } else {
        updatePhoto(rotatePlacement(rawPlacement.get(), event.rotationChange));
      }
    },
    onDeactivate: endGesture,
  });

  const tap = useTapGesture({
    onDeactivate: (event) => {
      if (!event.canceled) {
        const point = { x: event.x / ratio, y: event.y / ratio };
        scheduleOnRN(tapAt, hitTestLayers(boxes, point, canvas, MIN_TOUCH / ratio));
      }
    },
  });

  // Dragging, pinching and rotating go together; a tap only when none of them started.
  const gesture = useCompetingGestures(useSimultaneousGestures(pan, pinch, rotation), tap);

  // Strokes in screen points, whatever the canvas scale.
  const hairline = 1 / ratio;
  const frameStroke = 3 * hairline;
  const guideStroke = 2 * hairline;

  // Selection frame: the layer plus its margin (what snaps to the edges), drawn inside that
  // shape; it follows the fingers while the selected layer is dragged.
  const frameInset = frameStroke / 2;
  const liveFrameMatrix = useDerivedValue(() => frameMatrix(liveTransform.get(), canvas));
  const liveFrameRect = useDerivedValue(() =>
    frameRect(liveTransform.get(), dragged?.width ?? 0, dragged?.height ?? 0, frameInset),
  );
  const frame =
    selected === null
      ? null
      : selected.id === draggingId
        ? { matrix: liveFrameMatrix, rect: liveFrameRect }
        : {
            matrix: frameMatrix(selected.transform, canvas),
            rect: frameRect(selected.transform, selected.width, selected.height, frameInset),
          };

  // Snap guides: a vertical line at the left edge, center or right edge, a horizontal one at the
  // top, center or bottom; hidden while not snapped.
  const verticalGuideX = useDerivedValue(() =>
    guidePosition(snapX.get(), canvas.width, guideStroke / 2),
  );
  const verticalP1 = useDerivedValue(() => ({ x: verticalGuideX.get(), y: 0 }));
  const verticalP2 = useDerivedValue(() => ({ x: verticalGuideX.get(), y: canvas.height }));
  const verticalOpacity = useDerivedValue(() => (snapX.get() === 'none' ? 0 : 1));
  const horizontalGuideY = useDerivedValue(() =>
    guidePosition(snapY.get(), canvas.height, guideStroke / 2),
  );
  const horizontalP1 = useDerivedValue(() => ({ x: 0, y: horizontalGuideY.get() }));
  const horizontalP2 = useDerivedValue(() => ({ x: canvas.width, y: horizontalGuideY.get() }));
  const horizontalOpacity = useDerivedValue(() => (snapY.get() === 'none' ? 0 : 1));

  const trashStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(trashProgress.get(), [0, 1], ['rgba(0, 0, 0, 0.45)', ACCENT]),
    transform: [{ scale: reducedMotion ? 1 : 1 + 0.2 * trashProgress.get() }],
  }));

  return (
    <View style={{ width: displayWidth, height: displayHeight }}>
      <GestureDetector gesture={gesture}>
        <Canvas style={{ width: displayWidth, height: displayHeight }}>
          <Group transform={[{ scale: ratio }]}>
            <TemplateScene
              format={template.format}
              layers={layers}
              backdrop={
                backdrop === null ? { kind: 'checker' } : { kind: 'color', color: backdrop }
              }
              photo={
                photo === null
                  ? null
                  : { image: photo, matrix: livePhotoMatrix, rect: livePhotoRect }
              }
              live={
                draggingId === null
                  ? null
                  : { id: draggingId, matrix: liveMatrix, opacity: liveOpacity }
              }
            />
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
            {frame === null ? null : (
              <Group transform={frame.matrix}>
                {/* A dark edge under the white line keeps the frame visible on light photos. */}
                <RoundedRect
                  rect={frame.rect}
                  style="stroke"
                  strokeWidth={frameStroke}
                  color="rgba(0, 0, 0, 0.35)"
                />
                <RoundedRect
                  rect={frame.rect}
                  style="stroke"
                  strokeWidth={1.5 * hairline}
                  color="#FFFFFF"
                />
              </Group>
            )}
          </Group>
        </Canvas>
      </GestureDetector>
      {draggingId === null ? null : (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(150)}
          pointerEvents="none"
          accessibilityLabel={trashLabel}
          style={[
            {
              position: 'absolute',
              left: trashX - TRASH_SIZE / 2,
              top: trashY - TRASH_SIZE / 2,
              width: TRASH_SIZE,
              height: TRASH_SIZE,
              borderRadius: TRASH_SIZE / 2,
              alignItems: 'center',
              justifyContent: 'center',
            },
            trashStyle,
          ]}
        >
          <SymbolView name={{ ios: 'trash', android: 'delete' }} size={24} tintColor="#FFFFFF" />
        </Animated.View>
      )}
    </View>
  );
}
