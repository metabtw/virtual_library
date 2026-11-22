import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, sign } from 'node:crypto';
import { verifyAdMobReward, verifyWebReward } from './ad-rewards.ts';

const attempt = '00000000-0000-4000-a000-000000000001';
const timestamp = 1795293600000;
const transaction = 'receipt@verified-fixture';
const event = { attempt, transaction, watchedAt: new Date(timestamp).toISOString() };

Deno.test('rewarded web callbacks require a signature over the original body', () => {
  const secret = 'a-test-secret-with-at-least-32-bytes';
  const body = JSON.stringify({ attempt, transaction, timestamp });
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  assert.deepEqual(verifyWebReward(body, signature, secret), event);
  assert.equal(verifyWebReward(body.replace(transaction, 'changed'), signature, secret), null);
  assert.equal(verifyWebReward(body, signature, 'wrong'), null);
});

Deno.test('AdMob transaction uses the signed unit and bytes without trusting app callbacks', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const keyFor = async (id: string) => id === '42' ? pem : undefined;
  const unit = '1234567890';
  const body = `ad_unit=${unit}&custom_data=${attempt}&timestamp=${timestamp}&transaction_id=${encodeURIComponent(transaction)}`;
  const suffix = '&signature=' + sign('sha256', new TextEncoder().encode(body), privateKey).toString('base64url') + '&key_id=42';
  assert.deepEqual(await verifyAdMobReward(body + suffix, keyFor), { unit, reward: event });
  assert.equal(await verifyAdMobReward(body.replace(unit, '1234567891') + suffix, keyFor), null);
  assert.equal(await verifyAdMobReward(body + suffix.replace('key_id=42', 'key_id=43'), keyFor), null);
});
