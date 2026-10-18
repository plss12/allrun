import { createContext, type ReactNode, use, useState } from 'react';

import type { SavedTemplate } from '@/core/user-templates';
import { type AsyncState, useAsync } from '@/ui/use-async';

import { FileTemplateStore, type TemplateStore } from './template-store';

const TemplateStoreContext = createContext<TemplateStore | null>(null);

/** Provides where the user's templates are kept: local files until real login (ADR 003). */
export function TemplateStoreProvider({ children }: { readonly children: ReactNode }) {
  const [store] = useState<TemplateStore>(() => new FileTemplateStore());
  return <TemplateStoreContext value={store}>{children}</TemplateStoreContext>;
}

function useTemplateStore(): TemplateStore {
  const store = use(TemplateStoreContext);
  if (store === null) {
    throw new Error('useUserTemplates must be used inside <TemplateStoreProvider>');
  }
  return store;
}

/** The user's templates and how to change them. */
export type UserTemplates = AsyncState<readonly SavedTemplate[]> & {
  readonly retry: () => void;
  /** Stores a template; rejects if it could not be written. */
  readonly save: (saved: SavedTemplate) => Promise<void>;
  /** Deletes a template; rejects if it could not be deleted. */
  readonly remove: (id: string) => Promise<void>;
};

/**
 * Loads the user's templates and keeps them up to date as they are saved and removed. Changes
 * show once the store has them, so the list never shows a template that wasn't kept.
 */
export function useUserTemplates(): UserTemplates {
  const store = useTemplateStore();
  const [attempt, setAttempt] = useState(0);
  const loaded = useAsync(() => store.list(), `user-templates#${attempt}`);
  /** The list after the changes made since it loaded; `null` until the first change. */
  const [changed, setChanged] = useState<{
    readonly attempt: number;
    readonly templates: readonly SavedTemplate[];
  } | null>(null);
  const state: AsyncState<readonly SavedTemplate[]> =
    changed?.attempt === attempt ? { status: 'success', data: changed.templates } : loaded;

  /** Applies a change to the list as it is now. */
  const update = (change: (templates: readonly SavedTemplate[]) => readonly SavedTemplate[]) =>
    setChanged((current) => {
      const base =
        current?.attempt === attempt
          ? current.templates
          : loaded.status === 'success'
            ? loaded.data
            : [];
      return { attempt, templates: change(base) };
    });

  return {
    ...state,
    retry: () => setAttempt((value) => value + 1),
    save: async (saved) => {
      await store.save(saved);
      update((templates) => [saved, ...templates]);
    },
    remove: async (id) => {
      await store.remove(id);
      update((templates) => templates.filter(({ template }) => template.id !== id));
    },
  };
}
