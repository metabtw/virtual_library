import Constants from 'expo-constants';
import { startActivityAsync } from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { type ServerClock } from '../../public/focus-clock';
import { changeMonth, plannerToday, type StudyPlan } from '../../public/study-planner';
import { studyPlanner, updateDevice } from './api';
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

const planPrefix = 'study-plan:';
let planWork = Promise.resolve();

function synchronizePlanReminders(plans: StudyPlan[], title: string, body: string) {
  const attempt = planWork.then(async () => {
    const now = Date.now();
    const targets = new Map(plans.filter(plan => plan.reminderAt !== null && plan.reminderAt > now)
      .sort((a, b) => a.reminderAt! - b.reminderAt!).slice(0,24)
      .map(plan => [planPrefix + plan.id + ':' + plan.reminderAt, plan.reminderAt!]));
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of existing) {
      if (!notification.identifier.startsWith(planPrefix)) continue;
      const matches = targets.has(notification.identifier)
        && notification.content.title === title && notification.content.body === body;
      if (matches) targets.delete(notification.identifier);
      else await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
    for (const [identifier, time] of targets) {
      await Notifications.scheduleNotificationAsync({
        identifier, content: { title, body, sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(time), channelId },
      });
    }
  });
  planWork = attempt.catch(() => {});
  return attempt;
}

export const clearPlanReminders = () => synchronizePlanReminders([], '', '');

export function usePlanReminders(id: string, enabled: boolean | undefined, foreground: boolean, t: Translation, revision: number) {
  const month = plannerToday().slice(0,7);
  const reminders = useQuery({
    queryKey: ['planner-reminders', id, month],
    enabled: enabled === true && foreground,
    refetchInterval: 60_000,
    queryFn: async () => {
      const calendars = await Promise.all([studyPlanner({ month }), studyPlanner({ month: changeMonth(month,1) })]);
      return calendars.flatMap(calendar => calendar.plans).filter(plan => plan.reminderAt !== null);
    },
  });
  useEffect(() => {
    if (enabled === false) { void clearPlanReminders().catch(() => {}); return; }
    if (enabled && reminders.data && foreground)
      void synchronizePlanReminders(reminders.data, t.app, t.plannerRemindNow).catch(() => {});
  }, [enabled, foreground, reminders.data, t.app, t.plannerRemindNow, revision]);
}
