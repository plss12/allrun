import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { addFavorite, parseFavorites, removeFavorite } from '@/core/color-menu';
import { logError } from '@/ui/log';

/**
 * The user's favorite colors (ADR 009), kept on the phone in one small JSON file until real login
 * arrives, read once per session and shared by every color menu. The brand's colors are not
 * stored: the menu always shows them first.
 */

const FILE_NAME = 'color-favorites.json';

let favorites: readonly string[] | null = null;
const listeners = new Set<() => void>();

/** The favorites, read from the file the first time (an unreadable one counts as none). */
function current(): readonly string[] {
  if (favorites === null) {
    favorites = [];
    const file = new File(Paths.document, FILE_NAME);
    if (file.exists) {
      try {
        favorites = parseFavorites(JSON.parse(file.textSync()));
      } catch (error) {
        logError('Could not read the favorite colors; starting with none', error);
      }
    }
  }
  return favorites;
}

/** Keeps `next`, in memory and in the file, and tells every menu showing them. */
function store(next: readonly string[]): void {
  if (next === favorites) {
    return;
  }
  favorites = next;
  try {
    const file = new File(Paths.document, FILE_NAME);
    file.create({ overwrite: true });
    file.write(JSON.stringify(next));
  } catch (error) {
    // Still kept for this session.
    logError('Could not save the favorite colors', error);
  }
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The user's favorite colors, newest first, and how to add (first) or remove one. */
export function useColorFavorites(): {
  readonly favorites: readonly string[];
  readonly add: (hex: string) => void;
  readonly remove: (hex: string) => void;
} {
  const shown = useSyncExternalStore(subscribe, current);
  return {
    favorites: shown,
    add: (hex) => store(addFavorite(current(), hex)),
    remove: (hex) => store(removeFavorite(current(), hex)),
  };
}
