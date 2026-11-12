import { logError } from '@/ui/log';

/**
 * Where `supabase-js` keeps the session (ADR 019): encrypted with AES-GCM in AsyncStorage, its key
 * in the system's secure store (the Keychain, Android's Keystore), which takes no more than 2 KB, a
 * session being bigger. The refresh token opens the account: in plain AsyncStorage, a backup or a
 * rooted phone would give it away.
 */
export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** What the storage is made of, so that tests can stand in for the phone. */
export interface SessionStorageParts {
  /** Where the encrypted values go. */
  readonly values: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  };
  /** The key, made on first use and kept in the secure store. */
  readonly key: () => Promise<Cipher>;
}

/** Encrypts and decrypts text that is already ASCII. */
export interface Cipher {
  encrypt(ascii: string): Promise<string>;
  decrypt(sealed: string): Promise<string>;
}

/**
 * The session's text as ASCII, and back: AES takes bytes or base64, and a session may hold a name
 * with accents from Google or Apple. Time O(n).
 */
export function toAscii(text: string): string {
  return encodeURIComponent(text);
}

export function fromAscii(ascii: string): string {
  return decodeURIComponent(ascii);
}

/**
 * The session storage on `parts`. A value that can't be decrypted (its key lost, as after
 * restoring a backup on another phone) is dropped and read as none: the user signs in again.
 */
export function sessionStorage(parts: SessionStorageParts): SessionStorage {
  return {
    getItem: async (key) => {
      const sealed = await parts.values.getItem(key);
      if (sealed === null) {
        return null;
      }
      try {
        const cipher = await parts.key();
        return fromAscii(await cipher.decrypt(sealed));
      } catch (error) {
        logError('Could not decrypt the stored session: signing in again', error);
        await parts.values.removeItem(key);
        return null;
      }
    },
    setItem: async (key, value) => {
      const cipher = await parts.key();
      await parts.values.setItem(key, await cipher.encrypt(toAscii(value)));
    },
    removeItem: (key) => parts.values.removeItem(key),
  };
}
