import { useEffect, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { floatingSurface } from '@/theme/card-surface';

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

/** The notice as a pill, centered at `top`; nothing while there is none. */
export function Notice({
  message,
  top,
}: {
  readonly message: string | null;
  readonly top: number;
}) {
  if (message === null) {
    return null;
  }
  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(200)}
      pointerEvents="none"
      // Clear of the columns of buttons on either side.
      style={{ position: 'absolute', top, left: 72, right: 72, alignItems: 'center' }}
    >
      <View style={{ ...floatingSurface(18), paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text style={{ color: FLOATING_INK, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}
