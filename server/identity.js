import admins from '../config/admins.json' with { type: 'json' };
import { fail } from './core.js';
export async function principalFromFirebase(auth, token, env = {}) {
  let decoded;
  try {
    decoded = await auth.verifyIdToken(token, true);
  } catch {
    fail(false, 401, 'INVALID_TOKEN', 'Sesión inválida o revocada');
  }
  fail(
    decoded.email_verified === true,
    403,
    'EMAIL_UNVERIFIED',
    'Verifica tu email antes de continuar',
  );
  const email = (decoded.email || '').trim().toLowerCase();
  const pinned = (env.SUPERADMIN_UIDS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  let superadmin = false;
  if (
    pinned.includes(decoded.uid) ||
    (!pinned.length && admins.bootstrapVerifiedEmails.includes(email))
  ) {
    const record = await auth.getUser(decoded.uid);
    superadmin =
      record.uid === decoded.uid &&
      record.disabled !== true &&
      record.emailVerified === true &&
      (record.email || '').trim().toLowerCase() === email;
  }
  return { uid: decoded.uid, email, email_verified: true, superadmin, demo: false };
}
