import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.106.2';

type Delivery = { id: string; token: string; amount: number; attempts: number; locale: 'tr' | 'en' | null; user_id: string };
type Ticket = { status?: string; details?: { error?: string } };

export async function deliverRewards(admin: SupabaseClient) {
  const accessToken = Deno.env.get('EXPO_PUSH_ACCESS_TOKEN');
  if (!accessToken) return;
  const { data, error } = await admin.rpc('claim_focus_rewards');
  if (error) throw Error('Could not claim reward deliveries');
  const deliveries = (data ?? []) as Delivery[];
  const active = deliveries.filter(delivery => delivery.locale !== null && delivery.attempts <= 6);
  let tickets: Ticket[] = [];
  if (active.length) {
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(active.map(delivery => ({
          to: delivery.token, sound: 'default', channelId: 'focus',
          title: delivery.locale === 'en' ? 'Virtual Library' : 'Sanal Kütüphane',
          body: delivery.locale === 'en'
            ? `Study completed. You earned ${delivery.amount} coins.`
            : `Çalışma tamamlandı. ${delivery.amount} jeton kazandın.`,
        }))),
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) {
        const body = await response.json();
        if (Array.isArray(body.data) && body.data.length === active.length) tickets = body.data;
      }
    } catch {
      // Keep undelivered messages queued for the next worker.
    }
  }
  const results = new Map(active.map((delivery, index) => [delivery.id, tickets[index]]));
  await Promise.all(deliveries.map(async delivery => {
    const ticket = results.get(delivery.id);
    const queue = admin.from('reward_delivery');
    if (ticket?.details?.error === 'DeviceNotRegistered') {
      await admin.from('push_devices').delete().eq('token', delivery.token).eq('user_id', delivery.user_id);
    }
    if (ticket?.status === 'ok' || ticket?.details?.error === 'DeviceNotRegistered'
      || delivery.locale === null || delivery.attempts >= 6) {
      const { error } = await queue.delete().eq('id', delivery.id).eq('attempts', delivery.attempts);
      if (error) console.error('reward_delivery_cleanup', error.code);
      return;
    }
    const nextAttempt = new Date(Date.now() + Math.min(60 * 2 ** delivery.attempts, 1800) * 1000);
    const { error } = await queue.update({ next_attempt: nextAttempt.toISOString() }).eq('id', delivery.id).eq('attempts', delivery.attempts);
    if (error) console.error('reward_delivery_retry', error.code);
  }));
}
