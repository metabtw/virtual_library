import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { invokeLibrary } from '../../public/library-client';
import type { Leaderboard, Snapshot, StudySummary } from './model';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const authCallbackUrl = 'sanalkutuphane://auth';

export const supabase = url && key ? createClient(url, key, {
  auth: {
    storage: {
      getItem: SecureStore.getItemAsync,
      setItem: SecureStore.setItemAsync,
      removeItem: SecureStore.deleteItemAsync,
    },
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
}) : null;

// The browser session and Expo Router can both receive the same one-use PKCE code.
let lastExchange: { code: string; result: Promise<void> } | undefined;
export function completeAuthCode(code: string): Promise<void> {
  if (lastExchange?.code === code) return lastExchange.result;
  const result = (async () => {
    if (!supabase) throw Error('missingConfig');
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
  })();
  lastExchange = { code, result };
  return result;
}

const invoke = <T>(action: string, payload?: object) => invokeLibrary<T>(supabase, action, payload);
export const library = (action: string, payload?: object) => invoke<Snapshot>(action, payload);
export const deleteAccount = () => invoke<{ deleted: boolean }>('deleteAccount');
export const studySummary = () => invoke<StudySummary>('studySummary');
export const leaderboard = () => invoke<Leaderboard>('leaderboard');
export const updateDevice = (action: 'pushRegister' | 'pushRemove', token: string, locale?: string) =>
  invoke<{ ok: boolean }>(action, { token, locale });
