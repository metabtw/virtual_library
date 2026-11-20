import { createClient } from 'npm:@supabase/supabase-js@2.106.2';

import { deliverRewards } from '../_shared/rewards.ts';

declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void };

const url = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const auth = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!);
const actions = new Set(['state', 'profile', 'join', 'leave', 'status', 'start', 'verify', 'buy', 'place', 'deleteAccount', 'pushRegister', 'pushRemove', 'target', 'createRoom', 'joinCode', 'openBox', 'openChest', 'abandon']);

Deno.serve(async (request) => {
  if (request.method !== 'POST') return Response.json({ error: 'method' }, { status: 405 });
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!actions.has(body?.action)) return Response.json({ error: 'invalidAction' }, { status: 400 });

  if (body.action === 'deleteAccount') {
    const { error: deletion } = await admin.auth.admin.deleteUser(data.user.id);
    return Response.json(deletion ? { error: 'accountDeletion' } : { deleted: true }, { status: deletion ? 500 : 200 });
  }

  if (body.action === 'pushRegister' || body.action === 'pushRemove') {
    const token = body.payload?.token;
    if (typeof token !== 'string' || !/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,128}\]$/.test(token)) {
      return Response.json({ error: 'invalidToken' }, { status: 400 });
    }
    const devices = admin.from('push_devices');
    const { error: deviceError } = body.action === 'pushRegister'
      ? await devices.upsert({ token, user_id: data.user.id, locale: body.payload.locale === 'en' ? 'en' : 'tr' })
      : await devices.delete().eq('token', token).eq('user_id', data.user.id);
    return Response.json(deviceError ? { error: 'server' } : { ok: true });
  }

  const { data: result, error: failure } = await admin.rpc('library_action', {
    actor: data.user.id, action: body.action, payload: body.payload ?? {},
  });
  if (failure) {
    console.error('library_action', failure.code);
    return Response.json({ error: 'server' }, { status: 500 });
  }
  if (typeof result?.awarded === 'number') {
    EdgeRuntime.waitUntil(deliverRewards(admin).catch(() => console.error('reward_delivery_unavailable')));
  }
  return Response.json(result);
});
