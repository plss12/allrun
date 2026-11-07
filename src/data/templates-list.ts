import type { SavedTemplate } from '@/core/user-templates';
import { logError } from '@/ui/log';
import type { AsyncState } from '@/ui/use-async';

import type { TemplateStore } from './template-store';

/**
 * The user's templates for the whole app: one list that every screen reads and changes, so what
 * the editor saves or deletes shows in the selection screen under it (each screen kept its own
 * copy, and went on showing the old one: the user's report).
 */
export interface TemplatesList {
  /** What it holds now: the same object until it changes. */
  get(): AsyncState<readonly SavedTemplate[]>;
  /** Calls `listener` on every change, until the returned function is called. */
  subscribe(listener: () => void): () => void;
  /** Loads it from the store the first time, and again after it failed; else does nothing. */
  load(): void;
  /** Stores a template, first in the list once kept; rejects if it could not be written. */
  save(saved: SavedTemplate): Promise<void>;
  /** Deletes a template, from the list once deleted; rejects if it could not be deleted. */
  remove(id: string): Promise<void>;
}

const LOADING = { status: 'loading' } as const;

/** The list of the templates in `store` (see `TemplatesList`), not loaded until asked. */
export function templatesList(store: TemplateStore): TemplatesList {
  let state: AsyncState<readonly SavedTemplate[]> = LOADING;
  let loading = false;
  /** Changes made since the load under way started: it read the store before them. */
  let changesDuringLoad = 0;
  const listeners = new Set<() => void>();
  const set = (next: AsyncState<readonly SavedTemplate[]>) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const load = () => {
    if (loading || state.status === 'success') {
      return;
    }
    loading = true;
    changesDuringLoad = 0;
    if (state.status !== 'loading') {
      set(LOADING);
    }
    store.list().then(
      (templates) => {
        loading = false;
        if (changesDuringLoad > 0) {
          // A save or a delete may have come after the store was read: read it again.
          load();
          return;
        }
        set({ status: 'success', data: templates });
      },
      (error: unknown) => {
        loading = false;
        const asError = error instanceof Error ? error : new Error(String(error));
        logError('Could not load the templates', asError);
        set({ status: 'error', error: asError });
      },
    );
  };

  /** Applies a change the store already has: to the list, or to the load under way. */
  const changed = (change: (templates: readonly SavedTemplate[]) => readonly SavedTemplate[]) => {
    if (loading) {
      changesDuringLoad += 1;
    } else if (state.status === 'success') {
      set({ status: 'success', data: change(state.data) });
    }
  };

  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    save: async (saved) => {
      await store.save(saved);
      changed((templates) => [saved, ...templates]);
    },
    remove: async (id) => {
      await store.remove(id);
      changed((templates) => templates.filter(({ template }) => template.id !== id));
    },
  };
}
