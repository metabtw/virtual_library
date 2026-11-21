import { createHmac, timingSafeEqual, verify } from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.106.2';

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const unitPattern = /^ca-app-pub-\d{16}\/\d{10}$/;
const googleKeys = 'https://www.gstatic.com/admob/reward/verifier-keys.json';

function webPlacement() {
  if ((Deno.env.get('REWARDED_WEB_SECRET')?.length ?? 0) < 32) return null;
  try {
    const url = new URL(Deno.env.get('REWARDED_WEB_URL') ?? '');
    if (url.protocol === 'https:' && !url.username && !url.password) return url;
  } catch { /* The web placement needs an HTTPS URL. */ }
  return null;
}

function nativeUnit(platform: string) {
  const unit = Deno.env.get('REWARDED_ADMOB_' + platform.toUpperCase() + '_UNIT') ?? '';
  return unitPattern.test(unit) ? unit : null;
}

export function adPlatforms() {
  return { web: Boolean(webPlacement()), android: Boolean(nativeUnit('android')), ios: Boolean(nativeUnit('ios')) };
}

export async function openRewardedAd(admin: SupabaseClient, user: string, platform: unknown) {
  const url = platform === 'web' ? webPlacement() : null;
  const unit = platform === 'android' || platform === 'ios' ? nativeUnit(platform) : null;
  if (!url && !unit) return { error: 'adUnavailable' };
  const { data, error } = await admin.rpc('open_rewarded_ad', {
    actor: user, network: url ? 'web' : 'admob', unit: unit?.split('/')[1] ?? 'web',
  });
  if (error) {
    console.error('open_rewarded_ad', error.code);
    return { error: 'server' };
  }
  if (data?.error) return data;
  if (!data?.attempt) return { error: 'server' };
  if (url) {
    url.searchParams.set('attempt', data.attempt);
    return { url: url.href };
  }
  return { attempt: data.attempt, unit };
}

type Reward = { attempt: string; transaction: string; watchedAt: string };

function parseReward(attempt: unknown, transaction: unknown, timestamp: unknown): Reward | null {
  if (typeof attempt !== 'string' || !uuid.test(attempt)
    || typeof transaction !== 'string' || !transaction || transaction.length > 200
    || typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 8640000000000000) return null;
  return { attempt, transaction, watchedAt: new Date(timestamp).toISOString() };
}

export function verifyWebReward(body: string, signature: string, secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(signature) || secret.length < 32) return null;
  const digest = createHmac('sha256', secret).update(body).digest();
  if (!timingSafeEqual(digest, Buffer.from(signature, 'hex'))) return null;
  try {
    const event = JSON.parse(body);
    return parseReward(event.attempt, event.transaction, event.timestamp);
  } catch { return null; }
}

let keys: { entries: Map<string, string>; fetched: number } | undefined;
async function googlePublicKey(id: string) {
  const age = Date.now() - (keys?.fetched ?? 0);
  if (!keys || age >= 60 * 60 * 1000 || (!keys.entries.has(id) && age >= 5 * 60 * 1000)) {
    const response = await fetch(googleKeys, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Error('AdMob verification keys unavailable');
    const body: { keys: { keyId: number; pem: string }[] } = await response.json();
    keys = { entries: new Map(body.keys.map(key => [String(key.keyId), key.pem])), fetched: Date.now() };
  }
  return keys.entries.get(id);
}

export async function verifyAdMobReward(query: string, keyFor = googlePublicKey) {
  // Google signs the original query bytes before the two trailing signature fields.
  const signed = /^(.*)&signature=([^&]+)&key_id=(\d{1,18})$/.exec(query);
  if (!signed || query.length > 4096) return null;
  const signature = new URLSearchParams('signature=' + signed[2]).get('signature') ?? '';
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(signature)) return null;
  const params = new URLSearchParams(signed[1]);
  for (const name of ['transaction_id', 'timestamp', 'ad_unit']) {
    if (params.getAll(name).length !== 1) return null;
  }
  const unit = params.get('ad_unit') ?? '';
  if (!/^\d{10}$/.test(unit) || params.getAll('custom_data').length > 1) return null;
  const key = await keyFor(signed[3]);
  if (!key || !verify('sha256', Buffer.from(signed[1]), key, Buffer.from(signature, 'base64url'))) return null;
  const reward = parseReward(params.get('custom_data'), params.get('transaction_id'), Number(params.get('timestamp')));
  return { unit, reward };
}

export async function handleAdReward(request: Request, admin: SupabaseClient) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname.endsWith('/admob')) {
    try {
      const event = await verifyAdMobReward(url.search.slice(1));
      if (!event) return new Response(null, { status: 400 });
      const units = ['android', 'ios'].map(platform => nativeUnit(platform)?.split('/')[1]);
      if (!event.reward || !units.includes(event.unit)) return new Response(null, { status: 200 });
      return credit(admin, 'admob', event.unit, event.reward);
    } catch { return new Response(null, { status: 503 }); }
  }
  if (request.method === 'POST' && url.pathname.endsWith('/web')) {
    if (Number(request.headers.get('content-length')) > 4096) return new Response(null, { status: 413 });
    const body = await request.text();
    const signature = request.headers.get('x-reward-signature') ?? '';
    const event = body.length <= 4096 && verifyWebReward(body, signature, Deno.env.get('REWARDED_WEB_SECRET') ?? '');
    if (!event || !webPlacement()) return new Response(null, { status: 400 });
    return credit(admin, 'web', 'web', event);
  }
  return new Response(null, { status: 404 });
}

async function credit(admin: SupabaseClient, network: string, unit: string, event: Reward) {
  const { error } = await admin.rpc('credit_rewarded_ad', {
    attempt: event.attempt, network, unit, transaction_key: event.transaction, watched_at: event.watchedAt,
  });
  if (error) console.error('credit_rewarded_ad', error.code);
  return new Response(null, { status: error ? 503 : 200 });
}
