export function createAccountDialogs({ t, invoke, deleted }) {
  const confirmation = document.querySelector('#action-confirmation');
  const deletion = document.querySelector('#deletion-confirmation');
  const codeForm = deletion.querySelector('form');
  const code = codeForm.elements.code;
  const send = deletion.querySelector('[data-send-code]');
  const verify = deletion.querySelector('[type="submit"]');
  const feedback = deletion.querySelector('[data-deletion-feedback]');
  const instructions = deletion.querySelector('[data-deletion-instructions]');
  let challenge;
  let retryAt;
  let expiresAt;
  let pending = false;
  let clock;

  function confirm(title, body, label = title) {
    if (confirmation.open || deletion.open) return Promise.resolve(false);
    confirmation.returnValue = '';
    confirmation.querySelector('h2').textContent = title;
    confirmation.querySelector('p').textContent = body;
    confirmation.querySelector('[value="cancel"]').textContent = t('cancel');
    confirmation.querySelector('[value="confirm"]').textContent = label;
    const answer = new Promise(resolve => {
      confirmation.addEventListener('close', () => resolve(confirmation.returnValue === 'confirm'), { once: true });
    });
    confirmation.showModal();
    return answer;
  }

  function update() {
    const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
    const valid = challenge && Date.now() < expiresAt;
    code.disabled = pending || !valid;
    verify.disabled = pending || !valid || !/^\d{6}$/.test(code.value);
    send.disabled = pending || seconds > 0;
    send.textContent = (challenge ? t('newDeletionCode') : t('sendDeletionCode')) + (seconds ? ' · ' + seconds + ' s' : '');
    if (challenge && !valid && !feedback.textContent) feedback.textContent = t('deletionCodeExpired');
  }

  function showError(error) {
    const label = t(error.message);
    feedback.textContent = label === error.message ? t('authError') : label;
  }

  async function sendCode() {
    pending = true;
    code.value = '';
    feedback.textContent = '';
    update();
    try {
      const result = await invoke('startAccountDeletion');
      challenge = result.challenge;
      expiresAt = result.expiresAt;
      retryAt = Date.now() + 60000;
      instructions.textContent = t('deletionCodeInstructions');
    } catch (error) {
      if (error.message === 'emailRateLimited') retryAt = Date.now() + 60000;
      showError(error);
    } finally {
      pending = false;
      update();
      if (!code.disabled) code.focus();
    }
  }

  async function startDeletion() {
    if (!await confirm(t('deleteAccount'), t('confirmDelete'), t('sendDeletionCode'))) return;
    challenge = undefined;
    expiresAt = retryAt = 0;
    feedback.textContent = '';
    instructions.textContent = '';
    deletion.querySelector('h2').textContent = t('deletionCodeTitle');
    deletion.querySelector('label span').textContent = t('code');
    deletion.querySelector('[data-close-deletion]').textContent = t('cancel');
    verify.textContent = t('deleteAccount');
    deletion.showModal();
    clock = setInterval(update, 1000);
    await sendCode();
  }

  code.addEventListener('input', () => {
    code.value = code.value.replace(/\D/g, '').slice(0, 6);
    update();
  });
  codeForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (verify.disabled) return;
    const value = code.value;
    pending = true;
    feedback.textContent = t('deletingAccount');
    update();
    try {
      await invoke('deleteAccount', { challenge, code: value });
      deletion.close();
      await deleted();
    } catch (error) {
      code.value = '';
      showError(error);
      update();
    } finally {
      pending = false;
      update();
      if (deletion.open && !code.disabled) code.focus();
    }
  });
  deletion.addEventListener('cancel', event => { if (pending) event.preventDefault(); });
  deletion.querySelector('[data-close-deletion]').addEventListener('click', () => { if (!pending) deletion.close(); });
  deletion.addEventListener('close', () => clearInterval(clock));
  send.addEventListener('click', () => { if (!send.disabled) void sendCode(); });

  return { confirm, startDeletion };
}
