import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.106.2';

type Recipient = { id: string; token: string; locale: 'tr' | 'en' | null; user_id: string };
type Delivery = Recipient & { amount: number; attempts: number };
type Receipt = Recipient & { expo_ticket_id: string; attempts: number; receipt_attempts: number };
type PushResult = { id?: string; status?: string; details?: { error?: string } };

const maxAttempts = 6;
const later = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
const backoff = (attempts: number) => later(Math.min(60 * 2 ** attempts, 1800));

async function expoRequest<T>(path: string, token: string, payload: unknown): Promise<T | undefined> {
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/' + path, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) return (await response.json()).data as T;
  } catch {
    // The lease makes the job available for another attempt.
  }
}

async function removeDevice(admin: SupabaseClient, recipient: Recipient) {
  const { error } = await admin.from('push_devices').delete()
    .eq('token', recipient.token).eq('user_id', recipient.user_id);
  if (error) console.error('push_device_cleanup', error.code);
}

async function sendRewards(admin: SupabaseClient, accessToken: string) {
  const { data, error } = await admin.rpc('claim_focus_rewards');
  if (error) throw Error('Could not claim reward deliveries');
  const deliveries = (data ?? []) as Delivery[];
  const active = deliveries.filter(delivery => delivery.locale !== null && delivery.attempts <= maxAttempts);
  const tickets = active.length ? await expoRequest<PushResult[]>('send', accessToken, active.map(delivery => ({
    to: delivery.token, sound: 'default', channelId: 'focus',
    title: 'Virtual Study Crew',
    body: delivery.locale === 'en'
      ? `Study completed. You earned ${delivery.amount} coins.`
      : `Çalışma tamamlandı. ${delivery.amount} jeton kazandın.`,
  }))) : undefined;
  const results = new Map(active.map((delivery, index) =>
    [delivery.id, Array.isArray(tickets) && tickets.length === active.length ? tickets[index] : undefined]));

  await Promise.all(deliveries.map(async delivery => {
    const ticket = results.get(delivery.id);
    const reason = ticket?.details?.error;
    const queue = admin.from('reward_delivery');
    if (reason === 'DeviceNotRegistered') await removeDevice(admin, delivery);
    const accepted = ticket?.status === 'ok' && typeof ticket.id === 'string' && ticket.id.length > 0;
    const rejected = ticket?.status === 'error' && reason !== 'MessageRateExceeded';
    const write = accepted
      ? queue.update({ expo_ticket_id: ticket.id, next_attempt: later(900), receipt_attempts: 0 })
      : !delivery.locale || rejected || delivery.attempts >= maxAttempts
        ? queue.delete()
        : queue.update({ next_attempt: backoff(delivery.attempts) });
    const { error } = await write.eq('id', delivery.id).eq('attempts', delivery.attempts).is('expo_ticket_id', null);
    if (error) console.error('reward_ticket_store', error.code);
    if (rejected && reason !== 'DeviceNotRegistered') console.error('reward_ticket_rejected', reason);
  }));
}

async function confirmReceipts(admin: SupabaseClient, accessToken: string) {
  const { data, error } = await admin.rpc('claim_focus_receipts');
  if (error) throw Error('Could not claim push receipts');
  const receipts = (data ?? []) as Receipt[];
  const ids = receipts.filter(entry => entry.locale !== null).map(entry => entry.expo_ticket_id);
  const results = ids.length
    ? await expoRequest<Record<string, PushResult>>('getReceipts', accessToken, { ids })
    : undefined;

  await Promise.all(receipts.map(async entry => {
    const receipt = results?.[entry.expo_ticket_id];
    const reason = receipt?.details?.error;
    const queue = admin.from('reward_delivery');
    if (reason === 'DeviceNotRegistered') await removeDevice(admin, entry);
    const retrySend = reason === 'MessageRateExceeded' && entry.attempts < maxAttempts;
    const complete = receipt?.status === 'ok' || receipt?.status === 'error';
    const write = !entry.locale
      ? queue.delete()
      : retrySend
        ? queue.update({ expo_ticket_id: null, receipt_attempts: 0, next_attempt: backoff(entry.attempts) })
        : complete || entry.receipt_attempts >= maxAttempts
          ? queue.delete()
          : queue.update({ next_attempt: backoff(entry.receipt_attempts) });
    const { error } = await write.eq('id', entry.id).eq('receipt_attempts', entry.receipt_attempts)
      .eq('expo_ticket_id', entry.expo_ticket_id);
    if (error) console.error('reward_receipt_store', error.code);
    if (entry.locale && receipt?.status === 'error' && !retrySend && reason !== 'DeviceNotRegistered') {
      console.error('reward_receipt_rejected', reason);
    }
    if (entry.locale && !complete && entry.receipt_attempts >= maxAttempts) console.error('reward_receipt_unavailable');
  }));
}

export async function deliverRewards(admin: SupabaseClient) {
  const accessToken = Deno.env.get('EXPO_PUSH_ACCESS_TOKEN');
  if (!accessToken) return;
  const results = await Promise.allSettled([sendRewards(admin, accessToken), confirmReceipts(admin, accessToken)]);
  for (const result of results) if (result.status === 'rejected') throw result.reason;
}

type StudyReminder = { plan_id: string; token: string; due: string; attempts: number; locale: 'tr' | 'en' };

export async function deliverStudyReminders(admin: SupabaseClient) {
  const accessToken = Deno.env.get('EXPO_PUSH_ACCESS_TOKEN');
  if (!accessToken) return;
  const { data, error } = await admin.rpc('claim_study_reminders');
  if (error) throw Error('Could not claim study reminders');
  const reminders = (data ?? []) as StudyReminder[];
  if (!reminders.length) return;
  const tickets = await expoRequest<PushResult[]>('send', accessToken, reminders.map(entry => ({
    to: entry.token, sound: 'default', channelId: 'focus', title: 'Virtual Study Crew',
    body: entry.locale === 'en' ? 'A study plan is due. Open your calendar.' : 'Çalışma planının saati geldi. Takvimini aç.',
  })));
  await Promise.all(reminders.map(async (entry, index) => {
    const ticket = Array.isArray(tickets) && tickets.length === reminders.length ? tickets[index] : undefined;
    const finished = ticket?.status === 'ok' || (ticket?.status === 'error' && ticket.details?.error !== 'MessageRateExceeded');
    if (!finished) return; // The lease retries transient failures while the reminder is relevant.
    const { error: failure } = await admin.from('study_reminder_delivery').update({ sent: true })
      .eq('plan_id', entry.plan_id).eq('token', entry.token).eq('due', entry.due).eq('attempts', entry.attempts);
    if (failure) throw Error('Could not store study reminder result');
  }));
}
