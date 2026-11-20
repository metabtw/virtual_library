import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import type { Snapshot } from './model';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

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
