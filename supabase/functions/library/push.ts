import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.106.2';

export async function notifyReward(admin: SupabaseClient, userId: string, reward: number) {
  const accessToken = Deno.env.get('EXPO_PUSH_ACCESS_TOKEN');
  if (!accessToken) return;
  const { data } = await admin.from('push_devices').select('token, locale').eq('user_id', userId).limit(100);
  if (!data?.length) return;
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(data.map(device => ({
        to: device.token, sound: 'default', channelId: 'focus',
        title: device.locale === 'en' ? 'Virtual Library' : 'Sanal Kütüphane',
        body: device.locale === 'en' ? `Study completed. You earned ${reward} coins.` : `Çalışma tamamlandı. ${reward} jeton kazandın.`,
      }))),
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return;
    const result = await response.json();
    const removed = data.filter((_, i) => result.data?.[i]?.details?.error === 'DeviceNotRegistered');
    if (removed.length) await admin.from('push_devices').delete().in('token', removed.map(device => device.token)).eq('user_id', userId);
  } catch {
    // A notification failure must not undo an already-settled session.
  }
}
