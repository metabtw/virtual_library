import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import type { Snapshot } from './model';

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

async function invoke<T>(action: string, payload?: object): Promise<T> {
  if (!supabase) throw Error('missingConfig');
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>('library', {
    body: { action, payload },
  });
  if (error || !data) throw Error('server');
  if (data.error) throw Error(data.error);
  return data;
}

export const library = (action: string, payload?: object) => invoke<Snapshot>(action, payload);
export const deleteAccount = () => invoke<{ deleted: boolean }>('deleteAccount');

export const updateDevice = (action: 'pushRegister' | 'pushRemove', token: string, locale?: string) =>
  invoke<{ ok: boolean }>(action, { token, locale });
