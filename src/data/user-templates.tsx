import { createContext, type ReactNode, use, useEffect, useSyncExternalStore } from 'react';

import type { SavedTemplate } from '@/core/user-templates';
import type { AsyncState } from '@/ui/use-async';

import { syncedDesigns } from './design-sync';
import { FileTemplateStore } from './template-store';
import { type TemplatesList, templatesList } from './templates-list';

/** The user's designs, on the phone and synced with their account (ADR 019): one for the app. */
const designs = syncedDesigns(new FileTemplateStore(), templatesList);

const TemplatesListContext = createContext<TemplatesList | null>(null);

/**
 * Provides the user's templates, one list for every screen (see `TemplatesList`), kept on the
 * phone and synced with their account.
 */
export function TemplateStoreProvider({ children }: { readonly children: ReactNode }) {
  return <TemplatesListContext value={designs}>{children}</TemplatesListContext>;
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
 * The user's templates, loaded the first time a screen asks, and up to date in every screen as
 * any of them saves or removes one. Changes show once the store has them, so the list never shows
 * a template that wasn't kept.
 */
export function useUserTemplates(): UserTemplates {
  const list = use(TemplatesListContext);
  if (list === null) {
    throw new Error('useUserTemplates must be used inside <TemplateStoreProvider>');
  }
  const state = useSyncExternalStore(list.subscribe, list.get);
  useEffect(() => list.load(), [list]);
  return { ...state, retry: list.load, save: list.save, remove: list.remove };
}
