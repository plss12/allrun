import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { scheduleOnUI } from 'react-native-worklets';

/**
 * How long after a screen shows again its collection waits: past the transition and the teardown of
 * the screen left (the Stickers tab destroys some 75 canvas surfaces in a frame of about 170 ms).
 */
const COLLECT_AFTER_MS = 1000;

/** Hermes' `gc`, which a release build has too; absent elsewhere, nothing is collected. */
type WithGc = { readonly gc?: () => void };

/** A full collection of both JavaScript runtimes: React Native's and the UI thread's. */
function collectBothRuntimes(): void {
  (globalThis as WithGc).gc?.();
  scheduleOnUI(() => {
    'worklet';
    (globalThis as WithGc).gc?.();
  });
}

/**
 * Collects both JavaScript runtimes when the screen shows again, back from another, once settled.
 *
 * A screen's components hold native memory behind small JavaScript objects (Fabric's nodes, Skia's
 * pictures, paragraphs and paths), and Hermes, which sees only the small objects, collected them so
 * seldom that each screen opened and closed left its native memory behind: on a Samsung M32 the
 * Stickers tab, opened 50 times, took the native heap from 113 to 232 MB, never levelling off. With
 * a collection on coming back, it levels off at about 150 MB (ADR 014). The collection takes about
 * 60 ms of the JavaScript thread and 12 ms of the UI thread, which is why it waits for the screen to
 * settle; leaving before the wait ends cancels it.
 */
export function useCollectOnReturn(): void {
  const shownBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!shownBefore.current) {
        shownBefore.current = true;
        return undefined;
      }
      const timer = setTimeout(collectBothRuntimes, COLLECT_AFTER_MS);
      return () => clearTimeout(timer);
    }, []),
  );
}
