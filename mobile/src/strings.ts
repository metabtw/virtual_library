import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AmbienceTrack, ThemeChoice, Volume } from './model';

export type Locale = 'tr' | 'en';
type Page = 'rooms' | 'room' | 'shop' | 'profile' | 'games';
type Preferences = {
  locale: Locale; page: Page; alerts: boolean; usage: boolean; duration: string; durationChoice?: string; customBreak: string; volumes: Partial<Record<AmbienceTrack, Volume>>; theme: ThemeChoice;
  setLocale: (locale: Locale) => void; setPage: (page: Page) => void;
  setAlerts: (value: boolean) => void; setUsage: (value: boolean) => void;
  setDuration: (duration: string) => void;
  setDurationChoice: (choice: string) => void;
  setCustomBreak: (duration: string) => void;
  setTheme: (theme: ThemeChoice) => void;
  setVolume: (track: AmbienceTrack, level: Volume) => void;
};
export const usePreferences = create<Preferences>()(persist(set => ({
  locale: 'tr', page: 'rooms', alerts: false, usage: false, duration: '50', customBreak: '5', volumes: {}, theme: 'auto',
  setLocale: locale => set({ locale }), setPage: page => set({ page }),
  setAlerts: alerts => set({ alerts }), setUsage: usage => set({ usage }),
  setDuration: duration => set({ duration }),
  setDurationChoice: durationChoice => set({ durationChoice }),
  setCustomBreak: customBreak => set({ customBreak }),
  setTheme: theme => set({ theme }),
  setVolume: (track, level) => set(current => ({ volumes: { ...current.volumes, [track]: level } })),
}), {
  name: 'library-preferences-v1',
  skipHydration: true,
  storage: createJSONStorage(() => ({
    getItem: SecureStore.getItemAsync,
    setItem: SecureStore.setItemAsync,
    removeItem: SecureStore.deleteItemAsync,
  })),
  partialize: ({ locale, alerts, usage, duration, durationChoice, customBreak, volumes, theme }) => ({ locale, alerts, usage, duration, durationChoice, customBreak, volumes, theme }),
}));

export { words } from '../../public/strings';
export type Translation = typeof import('../../public/strings').words.tr;

export function message(t: Translation, error: unknown) {
  return error instanceof Error && Object.hasOwn(t, error.message)
    ? t[error.message as keyof Translation]
    : t.server;
}
