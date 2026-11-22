import { browserPopupRedirectResolver, getApps, GoogleAuthProvider, initializeApp, initializeAuth,
  inMemoryPersistence, signInWithPopup, signOut } from './firebase-google-sdk.js';

const appName = 'sanal-kutuphane-google';
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

export async function signInWithFirebaseGoogle(supabaseAuth, firebaseConfig, locale) {
  const app = getApps().find(existing => existing.name === appName) ?? initializeApp(firebaseConfig, appName);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
  auth.languageCode = locale;
  const provider = new GoogleAuthProvider();
  const nonce = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));
  provider.setCustomParameters({ prompt: 'select_account', nonce: hex(new Uint8Array(hash)) });

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.idToken) throw new Error('Missing Google ID token');
    const { error } = await supabaseAuth.signInWithIdToken({
      provider: 'google', token: credential.idToken, access_token: credential.accessToken, nonce,
    });
    if (error) throw error;
  } finally {
    if (auth.currentUser) await signOut(auth).catch(() => {});
  }
}
