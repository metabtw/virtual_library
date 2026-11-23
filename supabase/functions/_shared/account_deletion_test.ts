import { createClient, type User } from 'npm:@supabase/supabase-js@2.106.2';
import { accountDeletion } from './account-deletion.ts';

Deno.test('account deletion needs a verified challenge and a successful code before deleting the user', async () => {
  const id = '00000000-0000-4000-a000-000000000901';
  const session = '00000000-0000-4000-a000-000000000902';
  const challenge = '00000000-0000-4000-a000-000000000903';
  const token = 'header.' + btoa(JSON.stringify({ session_id: session })) + '.signature';
  const email = 'reader@example.test';
  const user = { id, email, email_confirmed_at: '2026-01-01T00:00:00Z' } as User;
  const events: string[] = [];
  const expiresAt = Date.now() + 120000;
  let confirmed = false;
  const mock = (async (input: string | URL | Request, request?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const path = url.pathname.split('/').at(-1)!;
    const body = typeof request?.body === 'string' ? JSON.parse(request.body) : {};
    events.push(path);
    if (path === 'reserve_account_deletion') {
      if (body.actor !== id || body.session !== session) throw new Error('Invalid request binding');
      return Response.json(challenge);
    }
    if (path === 'activate_account_deletion') return Response.json(expiresAt);
    if (path === 'attempt_account_deletion') return Response.json(body.challenge === challenge);
    if (path === 'consume_account_deletion') return Response.json(confirmed);
    if (path === 'otp') {
      if (body.email !== email || body.create_user !== false
        || url.searchParams.get('redirect_to') !== 'https://virtualstudycrew.com/account-deletion?intent=verify') {
        throw new Error('Incorrect deletion email target');
      }
      return Response.json({});
    }
    if (path === 'verify') {
      if (body.email !== email || body.type !== 'magiclink') throw new Error('Invalid email credential');
      if (body.token !== '013579') return Response.json({ code: 'otp_expired', msg: 'Invalid' }, { status: 403 });
      confirmed = true;
      return Response.json({ user, access_token: 'temporary', refresh_token: 'temporary', expires_in: 20, token_type: 'bearer' });
    }
    if (path === id && request?.method === 'DELETE' && confirmed) return Response.json({ user });
    throw new Error('Unexpected endpoint ' + path);
  }) as typeof fetch;
  const makeClient = () => createClient('https://auth.example.test', 'sb_publishable_fixture', {
    global: { fetch: mock }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const admin = makeClient();
  const action = (name: string, payload?: unknown) => accountDeletion(admin, makeClient(), token, user, name, payload);
  function equal(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Unexpected result ' + JSON.stringify(actual));
  }
  equal(await action('deleteAccount'), { error: 'deletionCodeInvalid' });
  equal(events, []);
  equal(await action('startAccountDeletion'), { challenge, expiresAt });
  equal(await action('deleteAccount', { challenge: id, code: '013579' }), { error: 'deletionCodeExpired' });
  equal(await action('deleteAccount', { challenge, code: '123456' }), { error: 'deletionCodeInvalid' });
  equal(await action('deleteAccount', { challenge, code: '013579' }), { deleted: true });
  equal(events, ['reserve_account_deletion', 'otp', 'activate_account_deletion', 'attempt_account_deletion',
    'attempt_account_deletion', 'verify', 'attempt_account_deletion', 'verify', 'consume_account_deletion', id]);
});
