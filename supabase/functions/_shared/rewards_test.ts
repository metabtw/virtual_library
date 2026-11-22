import assert from 'node:assert/strict';
import { createClient } from 'npm:@supabase/supabase-js@2.106.2';
import { deliverRewards } from './rewards.ts';

Deno.test('Expo tickets are held for receipts and unregistered devices are removed', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = Deno.env.get('EXPO_PUSH_ACCESS_TOKEN');
  const device = { id: 'delivery', token: 'ExpoPushToken[test_device]', locale: 'en', user_id: 'test-user' };
  const delivery = { ...device, amount: 10, attempts: 1 };
  const receipt = { ...device, expo_ticket_id: 'example-ticket', attempts: 1, receipt_attempts: 1 };
  let accepted = false;
  const writes: { method: string; url: URL; body: Record<string, unknown> | null }[] = [];
  const calls: string[] = [];

  Deno.env.set('EXPO_PUSH_ACCESS_TOKEN', 'test-token');
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname.split('/').pop();
    if (url.hostname === 'exp.host') {
      assert.equal(request.headers.get('Authorization'), 'Bearer test-token');
      const payload = await request.json();
      calls.push(path!);
      if (path === 'send') {
        assert.equal(payload[0].to, device.token);
        assert.match(payload[0].body, /10 coins/);
        return Response.json({ data: [{ status: 'ok', id: receipt.expo_ticket_id }] });
      }
      assert.equal(path, 'getReceipts');
      assert.deepEqual(payload, { ids: [receipt.expo_ticket_id] });
      return Response.json({ data: { [receipt.expo_ticket_id]: {
        status: 'error', details: { error: 'DeviceNotRegistered' },
      } } });
    }
    if (path === 'claim_focus_rewards') return Response.json(accepted ? [] : [delivery]);
    if (path === 'claim_focus_receipts') return Response.json(accepted ? [receipt] : []);
    assert.ok(path === 'reward_delivery' || path === 'push_devices');
    writes.push({ method: request.method, url, body: request.method === 'PATCH' ? await request.json() : null });
    return new Response(null, { status: 204 });
  };

  try {
    const admin = createClient('https://fixture.supabase.test', 'test-service-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    await deliverRewards(admin);
    assert.deepEqual(calls, ['send']);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].method, 'PATCH');
    assert.equal(writes[0].body?.expo_ticket_id, receipt.expo_ticket_id);
    assert.equal(writes[0].body?.receipt_attempts, 0);
    assert.equal(writes[0].url.searchParams.get('expo_ticket_id'), 'is.null');
    assert.ok(Date.parse(String(writes[0].body?.next_attempt)) >= Date.now() + 890000);

    accepted = true;
    await deliverRewards(admin);
    assert.deepEqual(calls, ['send', 'getReceipts']);
    assert.deepEqual(writes.slice(1).map(write => [write.method, write.url.pathname]), [
      ['DELETE', '/rest/v1/push_devices'], ['DELETE', '/rest/v1/reward_delivery'],
    ]);
    assert.equal(writes[1].url.searchParams.get('user_id'), 'eq.test-user');
    assert.equal(writes[2].url.searchParams.get('receipt_attempts'), 'eq.1');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) Deno.env.delete('EXPO_PUSH_ACCESS_TOKEN');
    else Deno.env.set('EXPO_PUSH_ACCESS_TOKEN', originalToken);
  }
});
