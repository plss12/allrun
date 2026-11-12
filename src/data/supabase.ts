import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { phoneSessionStorage } from './phone-session-storage';
import { readSupabaseConfig } from './phrases-table';

/** The client, once made; `null` once found that the project isn't set (see `supabase`). */
let made: SupabaseClient | null | undefined;

/**
 * The app's Supabase client (ADR 019), made on first use: its session encrypted on the phone and
 * refreshed only while the app is in front, as Supabase advises on phones (its refresh loop would
 * otherwise run in the background). `null` when the project's address and key aren't in the app's
 * environment.
 *
 * @throws Error when they are there but wrong.
 */
export function supabase(): SupabaseClient | null {
  if (made !== undefined) {
    return made;
  }
  const config = readSupabaseConfig({
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (config === null) {
    made = null;
    return made;
  }
  const client = createClient(config.url, config.publishableKey, {
    auth: {
      storage: phoneSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      // A phone has no address to read a session from: sign-ins hand it over themselves.
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void client.auth.startAutoRefresh();
    } else {
      void client.auth.stopAutoRefresh();
    }
  });
  made = client;
  return made;
}
