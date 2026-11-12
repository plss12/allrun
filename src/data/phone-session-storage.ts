import AsyncStorage from '@react-native-async-storage/async-storage';
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { type Cipher, type SessionStorage, sessionStorage } from './session-storage';

/** The secure store's entry for the session's key. */
const KEY_ENTRY = 'allrun.session-key';

/** The phone's AES-GCM cipher, its 256-bit key made once and kept in the secure store. */
async function phoneCipher(): Promise<Cipher> {
  const stored = await SecureStore.getItemAsync(KEY_ENTRY);
  let key: AESEncryptionKey;
  if (stored === null) {
    key = await AESEncryptionKey.generate();
    await SecureStore.setItemAsync(KEY_ENTRY, await key.encoded('hex'));
  } else {
    key = await AESEncryptionKey.import(stored, 'hex');
  }
  return {
    encrypt: async (ascii) => {
      const sealed = await aesEncryptAsync(btoa(ascii), key);
      return sealed.combined('base64');
    },
    decrypt: async (sealed) =>
      atob(await aesDecryptAsync(AESSealedData.fromCombined(sealed), key, { output: 'base64' })),
  };
}

/** The key, made once per launch. */
let cipher: Promise<Cipher> | null = null;

/** The phone's session storage. */
export const phoneSessionStorage: SessionStorage = sessionStorage({
  values: AsyncStorage,
  key: () => {
    cipher ??= phoneCipher().catch((error: unknown) => {
      // Asked again next time: the secure store may be locked for a moment.
      cipher = null;
      throw error;
    });
    return cipher;
  },
});
