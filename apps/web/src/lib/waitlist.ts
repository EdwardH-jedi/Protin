/**
 * Waitlist storage + validation helpers.
 *
 * TEMPORARY: this is a no-backend prototype. Submissions are persisted to
 * localStorage so the same browser cannot submit twice and so the user
 * sees a "you're on the list" state across reloads. When a real backend
 * (or a service like Mailchimp/ConvertKit/Loops) is wired up, the
 * `submitWaitlistEmail` implementation should call that service and
 * localStorage becomes a UX cache, not the source of truth.
 */

const STORAGE_KEY = 'protin.waitlist.v1';

// Practical RFC-5322-ish check. Backend must still validate.
const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type WaitlistResult =
  | { ok: true; alreadyJoined: boolean; email: string }
  | { ok: false; reason: 'empty' | 'invalid' };

export function isValidEmail(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed.length <= 254 && EMAIL_RE.test(trimmed);
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasJoinedWaitlist(): boolean {
  const ls = safeLocalStorage();
  if (!ls) return false;
  try {
    return Boolean(ls.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

export function getJoinedEmail(): string | null {
  const ls = safeLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: unknown };
    return typeof parsed.email === 'string' ? parsed.email : null;
  } catch {
    return null;
  }
}

/**
 * Validate and persist a waitlist submission. No network call.
 *
 * Returns:
 *  - `{ ok: false, reason: 'empty' | 'invalid' }` if validation fails.
 *  - `{ ok: true, alreadyJoined: true }`  if this browser already saved a
 *    waitlist email (we don't overwrite — first submission wins).
 *  - `{ ok: true, alreadyJoined: false }` for a fresh submission.
 */
export function submitWaitlistEmail(raw: string): WaitlistResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  if (!isValidEmail(trimmed)) return { ok: false, reason: 'invalid' };

  const ls = safeLocalStorage();
  const existing = getJoinedEmail();
  if (existing) {
    return { ok: true, alreadyJoined: true, email: existing };
  }

  const record = JSON.stringify({
    email: trimmed,
    submittedAt: new Date().toISOString(),
    schema: 1,
  });
  try {
    ls?.setItem(STORAGE_KEY, record);
  } catch {
    // Quota / private-mode failures are acceptable for a prototype —
    // the user still sees the success state for this session.
  }
  return { ok: true, alreadyJoined: false, email: trimmed };
}
