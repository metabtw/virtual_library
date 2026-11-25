import { timingSafeEqual } from 'node:crypto';
import { createClient } from 'npm:@supabase/supabase-js@2.106.2';
import { deliverRewards, deliverStudyReminders } from '../_shared/rewards.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const encoder = new TextEncoder();

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const expected = encoder.encode(Deno.env.get('REWARD_WORKER_SECRET') ?? '');
  const given = encoder.encode(request.headers.get('x-worker-secret') ?? '');
  if (expected.length < 32 || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response(null, { status: 401 });
  }
  const { data, error } = await admin.rpc('settle_focus_sessions');
  if (error) {
    console.error('settle_focus_sessions', error.code);
    return new Response(null, { status: 500 });
  }
  try {
    await Promise.all([deliverRewards(admin), deliverStudyReminders(admin)]);
  } catch {
    console.error('reward_delivery_unavailable');
    return new Response(null, { status: 503 });
  }
  return Response.json({ settled: data });
});
