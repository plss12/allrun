import { loadAsync } from 'expo-font';
import type { ComponentProps } from 'react';
import { StyleSheet, Text as NativeText, type TextStyle } from 'react-native';

/**
 * The faces the interface writes with, each a React Native family of its own, as custom fonts
 * register: Inter, on every phone (the system's differ, San Francisco and Roboto, in width too, so
 * a row that fit on one could be cut on another), and a monospaced one for columns of data. Inter
 * also centers by itself: the middle of its line is the middle of its capitals.
 */
export const INTERFACE_FACES = {
  regular: 'AllRun-Regular',
  medium: 'AllRun-Medium',
  semiBold: 'AllRun-SemiBold',
  bold: 'AllRun-Bold',
  italic: 'AllRun-Italic',
  mono: 'AllRun-Mono',
} as const;

/**
 * Loads the interface's faces. Before anything writes (see `app/_layout.tsx`): a text laid out with
 * the system's font and then redrawn would jump. A failure leaves the system's font, which the caller
 * logs.
 */
export function loadInterfaceFonts(): Promise<void> {
  return loadAsync({
    [INTERFACE_FACES.regular]: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
    [INTERFACE_FACES.medium]: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
    [INTERFACE_FACES.semiBold]: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
    [INTERFACE_FACES.bold]: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
    [INTERFACE_FACES.italic]: require('@expo-google-fonts/inter/400Regular_Italic/Inter_400Regular_Italic.ttf'),
    [INTERFACE_FACES.mono]: require('@expo-google-fonts/space-mono/400Regular/SpaceMono_400Regular.ttf'),
  });
}

/** What goes over a text's style for each weight, made once: most of a screen's texts share them. */
function faceStyle(fontFamily: string): TextStyle {
  // A family is a single face here: a weight or slant on top would have the system look for another.
  return { fontFamily, fontWeight: undefined, fontStyle: 'normal', includeFontPadding: false };
}
const REGULAR = faceStyle(INTERFACE_FACES.regular);
const MEDIUM = faceStyle(INTERFACE_FACES.medium);
const SEMI_BOLD = faceStyle(INTERFACE_FACES.semiBold);
const BOLD = faceStyle(INTERFACE_FACES.bold);
const ITALIC = faceStyle(INTERFACE_FACES.italic);
/** A text in a family of its own: only without Android's extra room over and under its letters. */
const OWN_FAMILY: TextStyle = { includeFontPadding: false };

function weightStyle(weight: TextStyle['fontWeight']): TextStyle {
  switch (weight) {
    case '500':
    case 500:
    case 'medium':
      return MEDIUM;
    case '600':
    case 600:
    case 'semibold':
      return SEMI_BOLD;
    case '700':
    case 700:
    case '800':
    case 800:
    case '900':
    case 900:
    case 'bold':
    case 'condensedBold':
    case 'heavy':
    case 'black':
      return BOLD;
    default:
      return REGULAR;
  }
}

/**
 * The interface's text: React Native's, writing `fontWeight` in the face of Inter it asks for (see
 * `INTERFACE_FACES`) unless it names a `fontFamily`, so it reads the same on every phone. The only
 * one to use: a lint rule keeps React Native's out. A text inside another doesn't inherit its weight,
 * so it says its own.
 */
export function Text({ style, ...props }: ComponentProps<typeof NativeText>) {
  const { fontFamily, fontWeight, fontStyle } = StyleSheet.flatten(style) ?? {};
  const own = fontStyle === 'italic' ? ITALIC : weightStyle(fontWeight);
  return <NativeText {...props} style={[style, fontFamily === undefined ? own : OWN_FAMILY]} />;
}
