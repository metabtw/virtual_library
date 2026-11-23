import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2.106.2';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const redirectTo = 'https://virtualstudycrew.com/account-deletion?intent=verify';

function sessionId(token: string) {
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const id: unknown = JSON.parse(atob(encoded)).session_id;
    return typeof id === 'string' && uuid.test(id) ? id : null;
  } catch {
    return null;
  }
}

export async function accountDeletion(admin: SupabaseClient, otp: SupabaseClient, token: string, user: User, action: string, payload: unknown) {
  const session = sessionId(token);
  if (!session) return { error: 'unauthorized' };
  if (!user.email || !user.email_confirmed_at) return { error: 'deletionEmailRequired' };
  const actor = user.id;
  const challenges = admin.from('account_deletion_challenges');

  if (action === 'startAccountDeletion') {
    const reserved = await admin.rpc('reserve_account_deletion', { actor, session });
    if (reserved.error) return { error: 'server' };
    const challenge = reserved.data;
    if (!challenge) return { error: 'emailRateLimited' };
    const sent = await otp.auth.signInWithOtp({
      email: user.email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });
    if (sent.error) {
      await challenges.delete().eq('user_id', actor).eq('id', challenge);
      return { error: sent.error.status === 429 ? 'emailRateLimited' : 'deletionSendError' };
    }
    const activation = await admin.rpc('activate_account_deletion', { actor, session, challenge });
    if (activation.error || !activation.data) return { error: 'deletionSendError' };
    return { challenge, expiresAt: activation.data };
  }

  const input = payload as { challenge?: unknown; code?: unknown } | null;
  const challenge = input?.challenge;
  const code = input?.code;
  if (typeof challenge !== 'string' || !uuid.test(challenge) || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return { error: 'deletionCodeInvalid' };
  }
  const attempt = await admin.rpc('attempt_account_deletion', { actor, session, challenge });
  if (attempt.error) return { error: 'server' };
  if (!attempt.data) return { error: 'deletionCodeExpired' };

  const verification = await otp.auth.verifyOtp({ email: user.email, token: code, type: 'magiclink' });
  if (verification.error || verification.data.user?.id !== actor) return { error: 'deletionCodeInvalid' };
  const consumed = await admin.rpc('consume_account_deletion', { actor, session, challenge });
  if (consumed.error || !consumed.data) return { error: 'deletionCodeExpired' };

  const { error } = await admin.auth.admin.deleteUser(actor);
  return error ? { error: 'accountDeletion' } : { deleted: true };
}
