import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import {
  DEFAULT_PROFILE,
  parseProfileRow,
  parseStoredProfile,
  type Profile,
  profileRow,
} from '@/core/profile';
import { logError } from '@/ui/log';

import { supabase } from './supabase';

/**
 * The signed-in user's profile (ADR 019), for the whole app: kept on the phone, to have it at once
 * (the routes are hidden as activities load), and asked to the account on signing in. A change
 * shows at once and is sent; if it can't be, it goes back and says so.
 */

/** Where the phone keeps it: one file, with whose it is. */
const file = () => new File(Paths.document, 'profile.json');

let userId: string | null = null;
let profile: Profile = DEFAULT_PROFILE;
const listeners = new Set<() => void>();

function set(next: Profile): void {
  profile = next;
  listeners.forEach((listener) => listener());
}

function keep(owner: string, kept: Profile): void {
  try {
    const target = file();
    target.create({ overwrite: true });
    target.write(JSON.stringify({ userId: owner, ...kept }));
  } catch (error) {
    // The account still has it: only the next launch waits for it.
    logError('Could not keep the profile on the phone', error);
  }
}

/** What the phone kept for `owner`, or `null` (another user's, none, or damaged). */
function kept(owner: string): Profile | null {
  try {
    const target = file();
    if (!target.exists) {
      return null;
    }
    const stored = parseStoredProfile(JSON.parse(target.textSync()));
    return stored.userId === owner
      ? { routePrivacyMeters: stored.routePrivacyMeters, updateEmails: stored.updateEmails }
      : null;
  } catch (error) {
    logError('Could not read the profile kept on the phone', error);
    return null;
  }
}

/**
 * Follows `owner`'s profile: what the phone kept at once, then the account's. `null` (signed out)
 * forgets it, on the phone too: another person may sign in next.
 */
export function followProfile(owner: string | null): void {
  if (owner === userId) {
    return;
  }
  userId = owner;
  if (owner === null) {
    set(DEFAULT_PROFILE);
    try {
      const target = file();
      if (target.exists) {
        target.delete();
      }
    } catch (error) {
      logError('Could not forget the profile kept on the phone', error);
    }
    return;
  }
  set(kept(owner) ?? DEFAULT_PROFILE);
  const client = supabase();
  if (client === null) {
    return;
  }
  void (async () => {
    const { data, error } = await client
      .from('profiles')
      .select('route_privacy_meters, update_emails')
      .eq('id', owner)
      .single();
    if (userId !== owner) {
      return;
    }
    if (error !== null) {
      logError('Could not load the profile', error);
      return;
    }
    try {
      const fresh = parseProfileRow(data);
      set(fresh);
      keep(owner, fresh);
    } catch (invalid) {
      logError('The profile the account sent is not valid', invalid);
    }
  })();
}

/** The profile as it is now, and again whenever it changes. */
export function useProfile(): Profile {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => profile,
  );
}

/**
 * Changes the profile: on screen at once, then in the account and on the phone. Resolves `false`
 * when the account couldn't take it, with the profile back as it was.
 */
export async function changeProfile(change: Partial<Profile>): Promise<boolean> {
  const owner = userId;
  const client = supabase();
  if (owner === null || client === null) {
    return false;
  }
  const before = profile;
  const after = { ...before, ...change };
  set(after);
  const { error } = await client.from('profiles').update(profileRow(after)).eq('id', owner);
  if (userId !== owner) {
    return false;
  }
  if (error !== null) {
    logError('Could not change the profile', error);
    set(before);
    return false;
  }
  keep(owner, after);
  return true;
}
