import { CryptoDigestAlgorithm, digest, getRandomValues } from 'expo-crypto';

/**
 * What Supabase Auth needs of the Web Crypto API for PKCE (ADR 019), which React Native lacks:
 * secure random values for the verifier and SHA-256 for the challenge. Without them it made the
 * verifier with `Math.random` and sent it as it is ("plain"), and warned so. Both come from
 * `expo-crypto`, in Expo Go and in builds. Anything already there is kept.
 */
interface PkceCrypto {
  readonly getRandomValues: typeof getRandomValues;
  readonly subtle: {
    readonly digest: (
      algorithm: string | { readonly name: string },
      data: BufferSource,
    ) => Promise<ArrayBuffer>;
  };
}

/** Puts the random values and SHA-256 of `expo-crypto` where Supabase Auth looks for them. */
export function provideWebCrypto(): void {
  const scope = globalThis as { crypto?: Partial<PkceCrypto> };
  const existing = scope.crypto ?? {};
  const provided: PkceCrypto = {
    ...existing,
    getRandomValues: existing.getRandomValues ?? getRandomValues,
    subtle: existing.subtle ?? {
      digest: (algorithm, data) => {
        const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
        if (name.toUpperCase() !== 'SHA-256') {
          return Promise.reject(new Error(`Only SHA-256 is provided, not ${name}`));
        }
        return digest(CryptoDigestAlgorithm.SHA256, data);
      },
    },
  };
  Object.defineProperty(globalThis, 'crypto', {
    value: provided,
    configurable: true,
    writable: true,
  });
}
