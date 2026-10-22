import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dimensions,
  Keyboard,
  type KeyboardEvent,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { castsShadow } from '@/core/layer-style';
import { type Layer, MAX_TEXT_LENGTH } from '@/core/template';
import { colors } from '@/theme/colors';

import { hasItalic, previewFamily, usePreviewFonts } from './fonts';
import { TEXT_SIZE } from './template-scene';

/** Where the text sits on the canvas, in the editor's coordinates (screen points). */
export interface TextOrigin {
  /** Center of the text. */
  readonly x: number;
  readonly y: number;
  /** Screen points per canvas pixel at the text's size. */
  readonly scale: number;
  readonly rotation: number;
}

interface TypingOverlayProps {
  /** The text layer, with the draft as its content. */
  readonly layer: Extract<Layer, { kind: 'text' }>;
  readonly origin: TextOrigin;
  readonly onChangeText: (text: string) => void;
  /** Called once the text is back in place, to commit it. */
  readonly onDone: () => void;
}

/** The text is never smaller than this while typing (points per canvas pixel): about 27 pt… */
const MIN_SCALE = 0.45;
/** …nor bigger than this, so a few words fit on a line: about 48 pt. */
const MAX_SCALE = 0.8;
/** How Skia leans a font that has no italic: a quarter of the height, about 14 degrees. */
const SKIA_LEAN = `${(-Math.atan(0.25) * 180) / Math.PI}deg`;
/** Room at the top for the "Done" button. */
const TOP_ROOM = 60;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** The text rising to the keyboard, and settling back on the canvas. */
const RISE = { duration: 320, easing: EASE_OUT };
const SETTLE = { duration: 260, easing: EASE_OUT };
/** iOS keyboard animation curve, to follow it when the event gives no curve of its own. */
const KEYBOARD_EASING = Easing.bezier(0.38, 0.7, 0.125, 1);

/**
 * Typing a free text, like in a story editor: the text rises from its place on the canvas to
 * the space above the keyboard, straight and readable, over the photo (so its real contrast with
 * the photo shows), and settles back on "Done" or a tap elsewhere. The canvas keeps its size.
 *
 * The text is a native text field styled like the widget, so selecting, copying and pasting
 * work as anywhere else. It approximates the canvas (font, color, alignment, shadow); the canvas
 * draws the final text once it is back in place.
 */
export function TypingOverlay({ layer, origin, onChangeText, onDone }: TypingOverlayProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const previews = usePreviewFonts();
  const [closing, setClosing] = useState(false);
  const root = useRef<View>(null);
  const { style } = layer;
  const editScale = Math.min(Math.max(origin.scale, MIN_SCALE), MAX_SCALE);
  const startScale = origin.scale / editScale;

  /** 0 at the text's place on the canvas, 1 above the keyboard. */
  const progress = useSharedValue(0);
  // Layout, in the overlay's coordinates; the keyboard top in the window's.
  const overlayTop = useSharedValue(0);
  const overlayWidth = useSharedValue(0);
  const overlayHeight = useSharedValue(0);
  const textHeight = useSharedValue(0);
  const keyboardTop = useSharedValue(Dimensions.get('window').height);

  useEffect(() => {
    progress.set(reducedMotion ? 1 : withTiming(1, RISE));
  }, [progress, reducedMotion]);

  // Follows the keyboard as it slides, with its own timing.
  useEffect(() => {
    const follow = (event: KeyboardEvent) => {
      const top = event.endCoordinates.screenY;
      keyboardTop.set(
        reducedMotion || event.duration === 0
          ? top
          : withTiming(top, { duration: event.duration, easing: KEYBOARD_EASING }),
      );
    };
    const [show, hide] =
      Platform.OS === 'ios'
        ? (['keyboardWillShow', 'keyboardWillHide'] as const)
        : (['keyboardDidShow', 'keyboardDidHide'] as const);
    const subscriptions = [Keyboard.addListener(show, follow), Keyboard.addListener(hide, follow)];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [keyboardTop, reducedMotion]);

  const finish = () => {
    if (closing) {
      return;
    }
    setClosing(true);
    Keyboard.dismiss();
    if (reducedMotion) {
      onDone();
      return;
    }
    progress.set(
      withTiming(0, SETTLE, (finished) => {
        if (finished) {
          scheduleOnRN(onDone);
        }
      }),
    );
  };

  const textStyle = useAnimatedStyle(() => {
    const p = progress.get();
    // The free space between the "Done" button and the keyboard.
    const bottom = Math.min(overlayHeight.get(), keyboardTop.get() - overlayTop.get());
    const targetY = (TOP_ROOM + bottom) / 2;
    const centerY = origin.y + (targetY - origin.y) * p;
    const centerX = origin.x + (overlayWidth.get() / 2 - origin.x) * p;
    return {
      maxHeight: Math.max(bottom - TOP_ROOM - 16, 0),
      transform: [
        { translateX: centerX - overlayWidth.get() / 2 },
        { translateY: centerY - textHeight.get() / 2 },
        { rotate: `${origin.rotation * (1 - p)}rad` },
        { scale: startScale + (1 - startScale) * p },
      ],
    };
  });

  const shadow = castsShadow(style.color);
  return (
    <View
      ref={root}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        overlayWidth.set(width);
        overlayHeight.set(height);
        root.current?.measureInWindow((_x, y) => overlayTop.set(y));
      }}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {/* A tap outside the text ends typing, like "Done". */}
      <Pressable
        accessible={false}
        importantForAccessibility="no"
        onPress={finish}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <Animated.View
        onLayout={(event) => textHeight.set(event.nativeEvent.layout.height)}
        style={[{ position: 'absolute', top: 0, left: 16, right: 16 }, textStyle]}
      >
        <TextInput
          autoFocus
          multiline
          editable={!closing}
          maxLength={MAX_TEXT_LENGTH}
          value={layer.content}
          onChangeText={onChangeText}
          accessibilityLabel={t('editor.textTitle')}
          selectionColor={colors.tint}
          style={{
            padding: 0,
            color: style.color,
            opacity: layer.opacity,
            fontFamily: previews
              ? previewFamily(style.font, style.bold, style.italic === true)
              : undefined,
            fontWeight: previews ? undefined : style.bold ? '700' : '400',
            fontStyle: !previews && style.italic === true ? 'italic' : 'normal',
            // A font without an italic is leaned as Skia leans it on the canvas.
            transform:
              previews && style.italic === true && !hasItalic(style.font)
                ? [{ skewX: SKIA_LEAN }]
                : [],
            fontSize: TEXT_SIZE * editScale,
            textAlign: style.align,
            textShadowColor: shadow ? 'rgba(0, 0, 0, 0.45)' : 'transparent',
            textShadowOffset: { width: 0, height: 3 * editScale },
            textShadowRadius: shadow ? 10 * editScale : 0,
          }}
        />
      </Animated.View>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={finish}
        style={({ pressed }) => ({
          position: 'absolute',
          top: 8,
          right: 16,
          minHeight: 44,
          paddingHorizontal: 18,
          borderRadius: 22,
          justifyContent: 'center',
          backgroundColor: colors.tint,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text style={{ color: colors.onTint, fontSize: 17, fontWeight: '700' }}>
          {t('editor.done')}
        </Text>
      </Pressable>
    </View>
  );
}
