import { createClient } from 'npm:@supabase/supabase-js@2.106.2';

import { accountDeletion } from '../_shared/account-deletion.ts';
import { deliverRewards } from '../_shared/rewards.ts';
import { adPlatforms, openRewardedAd } from '../_shared/ad-rewards.ts';

declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void };

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(url, serviceKey);
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const actions = new Set([
  'state', 'profile', 'join', 'leave', 'status', 'start', 'verify', 'buy', 'place',
  'startAccountDeletion', 'deleteAccount', 'finishTour', 'pushRegister', 'pushRemove', 'target', 'createRoom', 'roomVisibility', 'joinCode',
  'openBox', 'openChest', 'abandon', 'studySummary', 'studyTogether', 'joinStudyMeet', 'studyPlanner', 'leaderboard', 'rankingVisibility', 'react',
  'addFriend', 'addDeskFriend', 'setDoNotDisturb', 'answerFriend', 'removeFriend', 'inviteFriend', 'answerStudyInvite', 'adStart', 'roomPresence',
]);

// Browser calls use an explicit Supabase bearer token. The endpoint has no cookie-based session.
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const reply = (body: unknown, { status = 200 } = {}) => Response.json(body, { status, headers });

const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const utf8 = new TextEncoder();
let demoSigningKey: Promise<CryptoKey> | undefined;

async function signDemoNetwork(source: string) {
  demoSigningKey ??= crypto.subtle.importKey('raw', utf8.encode(serviceKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', await demoSigningKey, utf8.encode(source))));
}

async function runDemo(payload: Record<string, unknown>, operation: string, actor?: string, source?: string) {
  const fresh = operation === 'new';
  const key = fresh ? hex(crypto.getRandomValues(new Uint8Array(32))) : payload.key;
  if (typeof key !== 'string' || (!fresh && typeof payload.id !== 'string')) return reply({ error: 'demoMissing' });
  const network = fresh ? await signDemoNetwork(source ?? '') : '';
  const { data, error } = await admin.rpc('study_demo', {
    key_in: key, id_in: fresh ? '' : payload.id, operation, network_in: network,
    duration_in: typeof payload.duration === 'number' && [5, 25, 50, 90].includes(payload.duration) ? payload.duration : null,
    actor: actor ?? null,
  });
  if (error) return reply({ error: 'server' }, { status: 500 });
  return reply(fresh && data?.id ? { ...data, key } : data);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error: 'method' }, { status: 405 });
  const body = await request.json().catch(() => null);
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
  if (body?.action === 'demoStart') {
    const source = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
    return runDemo({}, 'new', undefined, source);
  }
  if (body?.action === 'demoEvent' && ['state', 'start', 'stop', 'verify'].includes(payload.operation))
    return runDemo(payload, payload.operation);
  if (body?.action === 'studyMeetPreview') {
    if (typeof payload.id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(payload.id))
      return reply({ error: 'meetUnavailable' });
    const { data, error } = await admin.rpc('study_meet_preview', { meet_id: payload.id });
    return error ? reply({ error: 'server' }, { status: 500 }) : reply(data);
  }
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return reply({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) {
    return reply({ error: 'unauthorized' }, { status: 401 });
  }
  if (body?.action === 'demoClaim') return runDemo(payload, 'claim', data.user.id);
  if (!actions.has(body?.action)) return reply({ error: 'invalidAction' }, { status: 400 });

  if (body.action === 'startAccountDeletion' || body.action === 'deleteAccount') {
    const otp = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    return reply(await accountDeletion(admin, otp, token, data.user, body.action, body.payload));
  }
  if (body.action === 'adStart') return reply(await openRewardedAd(admin, data.user.id, body.payload?.platform));

  if (body.action === 'pushRegister' || body.action === 'pushRemove') {
    const token = body.payload?.token;
    if (typeof token !== 'string' || !/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,128}\]$/.test(token)) {
      return reply({ error: 'invalidToken' }, { status: 400 });
    }
    const devices = admin.from('push_devices');
    const { error: deviceError } = body.action === 'pushRegister'
      ? await devices.upsert({ token, user_id: data.user.id, locale: body.payload.locale === 'en' ? 'en' : 'tr' })
      : await devices.delete().eq('token', token).eq('user_id', data.user.id);
    return reply(deviceError ? { error: 'server' } : { ok: true });
  }

  const { data: result, error: failure } = await admin.rpc('library_action', {
    actor: data.user.id, action: body.action, payload: body.payload ?? {},
  });
  if (failure) {
    console.error('library_action', failure.code);
    return reply({ error: 'server' }, { status: 500 });
  }
  if (typeof result?.awarded === 'number' && result.awarded > 0) {
    EdgeRuntime.waitUntil(deliverRewards(admin).catch(() => console.error('reward_delivery_unavailable')));
  }
  return reply(result?.profile ? { ...result, adPlatforms: adPlatforms(), plannerRemote: Boolean(Deno.env.get('EXPO_PUSH_ACCESS_TOKEN')) } : result);
});
