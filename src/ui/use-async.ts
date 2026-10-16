import { useEffect, useState } from 'react';

import { logError } from './log';

/** State of an async load: every screen that loads data renders all three. */
export type AsyncState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: Error }
  | { readonly status: 'success'; readonly data: T };

const LOADING = { status: 'loading' } as const;

/**
 * Runs `load` whenever `key` changes and tracks its state. Each result is stored with the request
 * it answers, so a new key reads as loading straight away and a slow earlier request never
 * overwrites a newer one.
 *
 * @param key - Identity of the request (e.g. a date range as text); a new key reloads.
 * @returns The current state and `retry`, which runs the same load again.
 */
export function useAsync<T>(
  load: () => Promise<T>,
  key: string,
): AsyncState<T> & { readonly retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    readonly request: string;
    readonly state: AsyncState<T>;
  } | null>(null);
  const request = `${key}#${attempt}`;

  useEffect(() => {
    let current = true;
    load().then(
      (data) => {
        if (current) {
          setResult({ request, state: { status: 'success', data } });
        }
      },
      (error: unknown) => {
        if (current) {
          const asError = error instanceof Error ? error : new Error(String(error));
          logError(`Load failed (${key})`, asError);
          setResult({ request, state: { status: 'error', error: asError } });
        }
      },
    );
    return () => {
      current = false;
    };
    // `load` is recreated on every render; `request` says when to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const state = result?.request === request ? result.state : LOADING;
  return { ...state, retry: () => setAttempt((value) => value + 1) };
}
