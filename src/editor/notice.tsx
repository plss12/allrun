import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { floatingSurface } from '@/theme/card-surface';
import { Text } from '@/ui/text';

import { FLOATING_INK } from './round-button';

/** How long a notice stays, in milliseconds. */
const NOTICE_MS = 2200;

/** A short message over the canvas that goes away by itself (a toast). */
export interface EditorNotice {
  /** The message shown, or `null`. */
  readonly message: string | null;
  /** Shows `message` for a moment, replacing any other, and reads it to screen readers. */
  readonly show: (message: string) => void;
}

export function useNotice(): EditorNotice {
  const [notice, setNotice] = useState<{ readonly message: string; readonly id: number } | null>(
    null,
  );
  const id = notice?.id;
  useEffect(() => {
    if (id === undefined) {
      return;
    }
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [id]);
  return {
    message: notice?.message ?? null,
    show: (message) => {
      setNotice((current) => ({ message, id: (current?.id ?? 0) + 1 }));
      AccessibilityInfo.announceForAccessibility(message);
    },
  };
}

/**
 * The notice in the middle of what holds it, big, where it can't be missed (the user's choice: at the
 * top they hardly showed); nothing while there is none.
 */
export function Notice({ message }: { readonly message: string | null }) {
  if (message === null) {
    return null;
  }
  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(200)}
      pointerEvents="none"
      // Clear of the columns of buttons on either side.
      style={{
        position: 'absolute',
        left: 72,
        right: 72,
        alignItems: 'center',
        top: 0,
        bottom: 0,
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          ...floatingSurface(18),
          paddingHorizontal: 24,
          paddingVertical: 14,
        }}
      >
        <Text
          style={{
            color: FLOATING_INK,
            fontSize: 20,
            fontWeight: '600',
            textAlign: 'center',
          }}
        >
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}
