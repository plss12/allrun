import {
  createContext,
  Fragment,
  type ReactElement,
  type ReactNode,
  type Ref,
  use,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  type ScrollViewProps,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  GestureDetector,
  ScrollView as GestureScrollView,
  usePanGesture,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';

/**
 * The app's own sheet, the same on every phone (ADR 015): a tall card that rises from the bottom
 * nearly to the top, over the screen dimmed behind it, and closes by dragging it down (from its
 * header, or from its list once at its top), by tapping outside it, with its close button or with
 * Android's back. React Native's `Modal` was a card on iOS and the whole screen on Android, and
 * on Android it destroyed what it held on every closing.
 *
 * Its movement runs on React Native's native animation driver, as does a drag: neither commits the
 * screen's tree on each frame, which an animated view of Reanimated does (ADR 014).
 */

/** Room between the top of the screen's safe area and the card. */
const TOP_GAP = 10;
/** The card's top corners: what it holds rounds its own top as well (see `SheetFrame`). */
export const SHEET_RADIUS = 12;
const BACKDROP = 'rgba(0, 0, 0, 0.5)';
const OPEN = { duration: 320, easing: Easing.bezier(0.2, 0.9, 0.25, 1) } as const;
const CLOSE = { duration: 240, easing: Easing.bezier(0.4, 0, 1, 1) } as const;
/** A drag past this share of the card, or faster than this (points a second), closes it. */
const CLOSE_SHARE = 0.25;
const CLOSE_VELOCITY = 900;
/** How far a finger goes down before it drags the card, and up or sideways before it doesn't. */
const DRAG_START = 10;
const DRAG_FAIL_UP = -10;
const DRAG_FAIL_SIDEWAYS = 24;

/** A sheet as its screen's host draws it. */
interface SheetEntry {
  readonly id: string;
  readonly node: ReactNode;
  readonly visible: boolean;
}

/**
 * The sheets of a screen, drawn over it by its `SheetHost`. What the host reads is a new array on
 * each change, never the store itself: React's compiler keeps whatever a render computes from an
 * object that stays the same, and a host reading the store's methods drew no sheet.
 */
class SheetStore {
  private entries: readonly SheetEntry[] = [];
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly snapshot = () => this.entries;

  set(id: string, node: ReactNode, visible: boolean) {
    const entry = { id, node, visible };
    const at = this.entries.findIndex((one) => one.id === id);
    this.entries =
      at < 0 ? [...this.entries, entry] : this.entries.map((one, i) => (i === at ? entry : one));
    this.changed();
  }

  delete(id: string) {
    if (this.entries.some((one) => one.id === id)) {
      this.entries = this.entries.filter((one) => one.id !== id);
      this.changed();
    }
  }

  private changed() {
    this.listeners.forEach((listener) => listener());
  }
}

const SheetStoreContext = createContext<SheetStore | null>(null);

/**
 * Where a screen's sheets are drawn: over everything the screen draws, `children`. One per screen
 * that has sheets, not one for the app: on iOS a screen presented as a modal goes over anything the
 * root draws. While a sheet is open, what is under it is hidden from screen readers, as under a
 * modal.
 */
export function SheetHost({ children }: { readonly children: ReactNode }) {
  const [store] = useState(() => new SheetStore());
  const entries = useSyncExternalStore(store.subscribe, store.snapshot);
  const covered = entries.some((entry) => entry.visible);
  return (
    <SheetStoreContext value={store}>
      {/* Never flattened: hiding it from screen readers would move what it holds to another
          native view, and a canvas so moved makes its surface again (ADR 014). */}
      <View
        collapsable={false}
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={covered}
        style={{ flex: 1 }}
      >
        {children}
      </View>
      {entries.map((entry) => (
        <Fragment key={entry.id}>{entry.node}</Fragment>
      ))}
    </SheetStoreContext>
  );
}

/** How a sheet moves, shared by the drags of whatever it holds (see `useSheetPan`). */
interface SheetMotion {
  /** How far a finger drags the card down, on the native driver. */
  readonly drag: Animated.Value;
  readonly visible: boolean;
  /** A drag has begun. */
  readonly start: () => void;
  /** A drag has ended, `translationY` down at `velocityY`: the card closes or goes back up. */
  readonly release: (translationY: number, velocityY: number) => void;
}

const SheetMotionContext = createContext<SheetMotion | null>(null);

/**
 * A drag that moves its sheet down, while `enabled`: each header and each list of a sheet has its
 * own, as a gesture goes on one view only, and a sheet can hold a list over another (the gallery's
 * verses, for one).
 */
function useSheetPan(motion: SheetMotion, enabled: boolean) {
  return usePanGesture({
    useAnimated: true,
    disableReanimated: true,
    runOnJS: true,
    enabled: motion.visible && enabled,
    activeOffsetY: DRAG_START,
    failOffsetY: DRAG_FAIL_UP,
    failOffsetX: [-DRAG_FAIL_SIDEWAYS, DRAG_FAIL_SIDEWAYS],
    onActivate: () => motion.start(),
    onUpdate: Animated.event([{ nativeEvent: { handlerData: { translationY: motion.drag } } }], {
      useNativeDriver: true,
    }),
    onDeactivate: (event) => motion.release(event.translationY, event.velocityY),
  });
}

/** The list a sheet's frame holds: the drag that goes with its scroll, and where it is. */
interface SheetList {
  readonly pan: ReturnType<typeof usePanGesture>;
  readonly onScrollY: (y: number) => void;
}

const SheetListContext = createContext<SheetList | null>(null);

/**
 * The parts of a sheet's frame (see `SheetFrame`): `header`, which always drags the sheet down, and
 * `children`, whose list (a `SheetScrollView`) drags it down too once scrolled to its top, as a
 * sheet of the system does.
 */
export function SheetParts({
  header,
  children,
}: {
  readonly header: ReactElement;
  readonly children: ReactNode;
}) {
  const motion = use(SheetMotionContext);
  if (motion === null) {
    throw new Error('SheetParts must be used inside a <Sheet>');
  }
  const [atTop, setAtTop] = useState(true);
  const headerPan = useSheetPan(motion, true);
  const listPan = useSheetPan(motion, atTop);
  const list = useMemo(
    (): SheetList => ({ pan: listPan, onScrollY: (y) => setAtTop(y <= 0) }),
    [listPan],
  );
  return (
    <>
      <GestureDetector gesture={headerPan}>{header}</GestureDetector>
      <GestureDetector gesture={listPan}>
        <View style={{ flex: 1 }}>
          <SheetListContext value={list}>{children}</SheetListContext>
        </View>
      </GestureDetector>
    </>
  );
}

/**
 * A scroll view that, inside a sheet's frame, scrolls together with the sheet's drag: scrolled to
 * its top, pulling further down drags the sheet instead, with no bounce or stretch of its own.
 * Elsewhere, React Native's own. For a vertical list's `renderScrollComponent`, or in place of a
 * `ScrollView`.
 */
export function SheetScrollView(
  props: ScrollViewProps & { readonly ref?: Ref<ScrollViewInstance> },
) {
  const list = use(SheetListContext);
  if (list === null) {
    return <ScrollView {...props} />;
  }
  const { onScroll } = props;
  return (
    <GestureScrollView
      {...props}
      simultaneousWith={list.pan}
      bounces={false}
      overScrollMode="never"
      scrollEventThrottle={props.scrollEventThrottle ?? 16}
      onScroll={(event) => {
        list.onScrollY(event.nativeEvent.contentOffset.y);
        onScroll?.(event);
      }}
    />
  );
}

/** `SheetScrollView` as a list's `renderScrollComponent`. */
export function renderSheetScroll(props: ScrollViewProps): ReactElement {
  return <SheetScrollView {...props} />;
}

interface SheetProps {
  readonly visible: boolean;
  /** Asked to close: a drag down, a tap outside, Android's back. */
  readonly onClose: () => void;
  /** Android's back, if it does something else first (a list over the sheet's own content). */
  readonly onBack?: () => void;
  /**
   * Whether what it holds stays mounted while closed, out of sight: its next opening shows it at
   * once, as it was. Otherwise it is mounted on opening and let go once closed.
   */
  readonly keepMounted?: boolean;
  readonly children: ReactNode;
}

/**
 * A sheet of the screen's `SheetHost`, which draws it over the screen: it can be put anywhere in
 * the screen's tree, as a modal could.
 */
export function Sheet(props: SheetProps) {
  const store = use(SheetStoreContext);
  if (store === null) {
    throw new Error('Sheet must be used inside a <SheetHost>');
  }
  const id = useId();
  // Every render: the sheet shows what its owner renders now.
  useLayoutEffect(() => {
    store.set(id, <SheetCard {...props} />, props.visible);
  });
  useEffect(() => () => store.delete(id), [store, id]);
  return null;
}

function SheetCard({ visible, onClose, onBack, keepMounted = false, children }: SheetProps) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const top = insets.top + TOP_GAP;
  const height = window.height - top;
  /** Whether what it holds is mounted: from its first opening, and while it closes. */
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) {
    setMounted(true);
  }
  // Where the card is, 0 open and `height` closed, plus how far a finger drags it down.
  const [{ base, drag, translateY }] = useState(() => {
    const at = new Animated.Value(visible ? 0 : height);
    const dragged = new Animated.Value(0);
    return {
      base: at,
      drag: dragged,
      translateY: Animated.add(
        at,
        dragged.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: 'clamp' }),
      ),
    };
  });
  const backdropOpacity = useMemo(
    () =>
      translateY.interpolate({
        inputRange: [0, height],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      }),
    [translateY, height],
  );
  /**
   * Whether the card moves (opening, closing, dragged): it is then drawn once into a texture of
   * its own, and each frame only moves the texture. Drawn as views, a card full of canvases was
   * drawn again on each frame of its movement, more than 20 ms of the GPU on a modest phone.
   */
  const [moving, setMoving] = useState(false);
  // Opening or closing moves it from this render on.
  const [movedFor, setMovedFor] = useState(visible);
  if (visible !== movedFor) {
    setMovedFor(visible);
    setMoving(true);
  }
  const latest = useRef({ onClose, height });
  useEffect(() => {
    latest.current = { onClose, height };
  });

  useEffect(() => {
    const animation = Animated.timing(base, {
      ...(visible ? OPEN : CLOSE),
      toValue: visible ? 0 : height,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      setMoving(false);
      if (finished && !visible && !keepMounted) {
        setMounted(false);
      }
    });
    return () => animation.stop();
  }, [visible, height, keepMounted, base]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      (onBack ?? onClose)();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onBack, onClose]);

  const motion = useMemo(
    (): SheetMotion => ({
      drag,
      visible,
      start: () => setMoving(true),
      release: (translationY, velocityY) => {
        const now = latest.current;
        const moved = Math.max(0, translationY);
        // The card stays where the finger left it, and goes on from there.
        base.setValue(moved);
        drag.setValue(0);
        if (moved > now.height * CLOSE_SHARE || velocityY > CLOSE_VELOCITY) {
          now.onClose();
        } else {
          Animated.timing(base, { ...OPEN, toValue: 0, useNativeDriver: true }).start(() =>
            setMoving(false),
          );
        }
      },
    }),
    [base, drag, visible],
  );

  if (!mounted) {
    return null;
  }
  return (
    // Never flattened, whatever it lets through (see `SheetHost`). Kept mounted and closed, it is
    // also transparent: out of sight already, Android still went through its hundreds of views on
    // every frame of the screen under it, and moving a widget went from 9 to 22 ms a frame on a
    // modest phone; a transparent view it skips, and its canvases keep their surfaces.
    <View
      collapsable={false}
      pointerEvents={visible ? 'box-none' : 'none'}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: visible || moving ? 1 : 0,
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: BACKDROP,
          opacity: backdropOpacity,
        }}
      >
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={onClose}
          style={{ flex: 1 }}
        />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal={visible}
        renderToHardwareTextureAndroid={moving}
        style={{
          position: 'absolute',
          top,
          left: 0,
          right: 0,
          height,
          borderTopLeftRadius: SHEET_RADIUS,
          borderTopRightRadius: SHEET_RADIUS,
          borderCurve: 'continuous',
          backgroundColor: colors.systemBackground,
          transform: [{ translateY }],
        }}
      >
        <SheetMotionContext value={motion}>{children}</SheetMotionContext>
      </Animated.View>
    </View>
  );
}
