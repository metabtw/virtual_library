import Constants from 'expo-constants';
import { startActivityAsync } from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { type ServerClock } from '../../public/focus-clock';
import { updateDevice } from './api';
import type { Locale, Translation } from './strings';

const channelId = 'focus';
const notificationId = 'focus-verification';
const storageKey = 'registered-expo-push-token';
let reminderWork = Promise.resolve();
let scheduled: { due: number; localTime: number; title: string; body: string; revision: number } | undefined;
let remoteWork = Promise.resolve();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
});

export async function allowReminders() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(channelId, {
      name: 'Focus', importance: Notifications.AndroidImportance.HIGH,
    });
  }
  return (await Notifications.requestPermissionsAsync()).granted;
}

export const hasExactReminderSettings = Platform.OS === 'android' && Number(Platform.Version) >= 31
  && Boolean(Constants.expoConfig?.android?.package);

export async function openExactReminderSettings() {
  await startActivityAsync('android.settings.REQUEST_SCHEDULE_EXACT_ALARM', {
    data: `package:${Constants.expoConfig?.android?.package}`,
  });
}

function runRemote(operation: () => Promise<void>) {
  const attempt = remoteWork.then(operation);
  remoteWork = attempt.catch(() => {});
  return attempt;
}

export function syncRemoteReminders(locale: Locale) {
  return runRemote(async () => {
    const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || Constants.easConfig?.projectId;
    if (!projectId || !(await Notifications.getPermissionsAsync()).granted) return;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    const previous = await SecureStore.getItemAsync(storageKey);
    if (previous && previous !== data) await updateDevice('pushRemove', previous);
    await updateDevice('pushRegister', data, locale);
    await SecureStore.setItemAsync(storageKey, data);
  });
}

export function removeRemoteReminders(accountDeleted = false) {
  return runRemote(async () => {
    const token = await SecureStore.getItemAsync(storageKey);
    if (!token) return;
    if (!accountDeleted) await updateDevice('pushRemove', token);
    await SecureStore.deleteItemAsync(storageKey);
  });
}

export function useReminder(enabled: boolean, due: number | null, clock: ServerClock | undefined, t: Translation, revision = 0) {
  const localTime = due === null || !clock ? null : due + clock.receiveTime - clock.serverTime;
  useEffect(() => {
    let obsolete = false;
    reminderWork = reminderWork.then(async () => {
      if (obsolete) return;
      if (enabled && due !== null && localTime !== null && scheduled?.due === due && scheduled.revision === revision
        && scheduled.title === t.app && scheduled.body === t.verify
        && Math.abs(scheduled.localTime - localTime) < 1500) return;
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      scheduled = undefined;
      if (!enabled || obsolete || due === null || localTime === null || localTime <= Date.now()) return;
      await Notifications.scheduleNotificationAsync({
        identifier: notificationId,
        content: { title: t.app, body: t.verify, sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(localTime), channelId },
      });
      scheduled = { due, localTime, title: t.app, body: t.verify, revision };
    }).catch(() => {});
    return () => { obsolete = true; };
  }, [enabled, due, localTime, t.app, t.verify, revision]);
  useEffect(() => () => {
    reminderWork = reminderWork.then(async () => {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      scheduled = undefined;
    }).catch(() => {});
  }, []);
}
