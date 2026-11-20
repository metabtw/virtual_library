import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { updateDevice } from './api';
import type { Locale, Translation } from './strings';

const channelId = 'focus';
const notificationId = 'focus-verification';
const storageKey = 'registered-expo-push-token';
let reminderWork = Promise.resolve();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
});

export async function allowReminders(locale: Locale) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(channelId, {
      name: 'Focus', importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || Constants.easConfig?.projectId;
  if (projectId) {
    // Local reminders remain available if this device cannot obtain a push token.
    try {
      const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
      const previous = await SecureStore.getItemAsync(storageKey);
      if (previous && previous !== data) await updateDevice('pushRemove', previous);
      await updateDevice('pushRegister', data, locale);
      await SecureStore.setItemAsync(storageKey, data);
    } catch {}
  }
  return true;
}

export async function removeRemoteReminders() {
  const token = await SecureStore.getItemAsync(storageKey);
  if (!token) return;
  await updateDevice('pushRemove', token);
  await SecureStore.deleteItemAsync(storageKey);
}

export function useReminder(enabled: boolean, due: number | null, offset: number, t: Translation) {
  // Round the server offset so regular heartbeats do not continually reschedule the same alarm.
  const localDue = due === null ? null : due - Math.round(offset / 1000) * 1000;
  useEffect(() => {
    let obsolete = false;
    reminderWork = reminderWork.then(async () => {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      if (!enabled || obsolete || !localDue || localDue <= Date.now() + 1000) return;
      await Notifications.scheduleNotificationAsync({
        identifier: notificationId,
        content: { title: t.app, body: t.verify, sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(localDue), channelId },
      });
    }).catch(() => {});
    return () => {
      obsolete = true;
      reminderWork = reminderWork.then(() => Notifications.cancelScheduledNotificationAsync(notificationId)).catch(() => {});
    };
  }, [enabled, localDue, t.app, t.verify]);
}
