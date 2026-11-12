import { fromAscii, sessionStorage, type SessionStorageParts, toAscii } from './session-storage';

jest.mock('@/ui/log', () => ({ logError: jest.fn() }));

/** A map for the values, and a stand-in cipher that a wrong key can't open. */
function parts(keyId = 'k1'): SessionStorageParts & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    values: {
      getItem: async (key) => map.get(key) ?? null,
      setItem: async (key, value) => {
        map.set(key, value);
      },
      removeItem: async (key) => {
        map.delete(key);
      },
    },
    key: async () => ({
      encrypt: async (ascii) => `${keyId}:${[...ascii].reverse().join('')}`,
      decrypt: async (sealed) => {
        if (!sealed.startsWith(`${keyId}:`)) {
          throw new Error('Wrong key');
        }
        return [...sealed.slice(keyId.length + 1)].reverse().join('');
      },
    }),
  };
}

describe('the session storage', () => {
  it('keeps a session with any letters, never as plain text', async () => {
    const phone = parts();
    const storage = sessionStorage(phone);
    const session = JSON.stringify({ user: { name: 'José Núñez 🏃' }, refresh_token: 'secret' });
    await storage.setItem('auth', session);
    expect(phone.map.get('auth')).not.toContain('secret');
    expect(await storage.getItem('auth')).toBe(session);
  });

  it('reads nothing for nothing stored, and removes', async () => {
    const storage = sessionStorage(parts());
    expect(await storage.getItem('auth')).toBeNull();
    await storage.setItem('auth', 'x');
    await storage.removeItem('auth');
    expect(await storage.getItem('auth')).toBeNull();
  });

  it('drops a session its key no longer opens, so that the user signs in again', async () => {
    const before = parts('old');
    await sessionStorage(before).setItem('auth', 'session');
    const after = { ...parts('new'), values: before.values };
    expect(await sessionStorage(after).getItem('auth')).toBeNull();
    expect(before.map.has('auth')).toBe(false);
  });

  it('turns any text into ASCII and back', () => {
    const text = 'Ñandú · 9,90 km · 🚴';
    expect(toAscii(text)).toMatch(/^[\x20-\x7E]*$/);
    expect(fromAscii(toAscii(text))).toBe(text);
  });
});
