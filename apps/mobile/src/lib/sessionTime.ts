/**
 * Pure helpers for the BookingComposer "Propose a session" picker.
 *
 * Kept dependency-free and side-effect-free so they can be unit-tested
 * directly without rendering the screen.
 */

export const MIN_SESSION_MINUTES = 30;
export const MAX_SESSION_MINUTES = 4 * 60;
export const DATE_PICKER_DAYS_AHEAD = 90;
export const TIME_INCREMENT_MINUTES = 15;

/** "YYYY-MM-DD" — the wire format the backend expects on the date side. */
export type DateString = string;
/** "HH:MM" — the wire format the backend expects on the time side. */
export type TimeString = string;

// ─── Date helpers ────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Date object → "YYYY-MM-DD" in the *local* timezone. */
export function toDateString(d: Date): DateString {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "YYYY-MM-DD" + "HH:MM" → Date in the local timezone. */
export function combineToLocalDate(date: DateString, time: TimeString): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/** Friendly display, e.g. "Sat, 6 Jun 2026". */
export function formatDateLabel(date: DateString): string {
  const d = combineToLocalDate(date, '00:00');
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Friendly display, e.g. "9:00 AM" or "21:30" depending on locale. */
export function formatTimeLabel(time: TimeString): string {
  const d = combineToLocalDate('2000-01-01', time);
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ─── Default values ──────────────────────────────────────────────────────────

/**
 * Tomorrow's date in local time.
 *
 * Date-stable across CI clock drift: callers that just want to "open the
 * screen and submit" get a valid future default regardless of when the
 * test runs.
 */
export function defaultDate(now: Date = new Date()): DateString {
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0
  );
  return toDateString(tomorrow);
}

export function defaultStartTime(): TimeString {
  return '09:00';
}

/** Start + 1 hour, clamped to same-day. */
export function plusOneHour(time: TimeString): TimeString {
  const [hh, mm] = time.split(':').map(Number);
  const total = hh * 60 + mm + 60;
  // Clamp to 23:45 so we never roll into "tomorrow" (same-day-only rule).
  const clamped = Math.min(total, 23 * 60 + 45);
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

// ─── Picker options ──────────────────────────────────────────────────────────

/** Today + the next `daysAhead` days, as "YYYY-MM-DD". */
export function dateOptions(
  now: Date = new Date(),
  daysAhead: number = DATE_PICKER_DAYS_AHEAD
): DateString[] {
  const out: DateString[] = [];
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(toDateString(d));
  }
  return out;
}

/**
 * 24-hour grid of "HH:MM" in TIME_INCREMENT_MINUTES steps.
 * Emits "00:00" through "23:45" for 15-minute increments.
 */
export function timeOptions(
  incrementMinutes: number = TIME_INCREMENT_MINUTES
): TimeString[] {
  const out: TimeString[] = [];
  for (let total = 0; total < 24 * 60; total += incrementMinutes) {
    out.push(`${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`);
  }
  return out;
}

// ─── Validation ──────────────────────────────────────────────────────────────

interface ValidationArgs {
  date: DateString;
  startTime: TimeString;
  endTime: TimeString;
  now?: Date;
}

/**
 * Returns null if the proposal is valid, or a user-friendly error string.
 *
 * Rules (v1):
 * - end strictly after start (same-day)
 * - duration in [MIN_SESSION_MINUTES, MAX_SESSION_MINUTES]
 * - if date is today, start must be at or after `now`
 */
export function computeValidationError({
  date,
  startTime,
  endTime,
  now = new Date(),
}: ValidationArgs): string | null {
  if (!date || !startTime || !endTime) return null;

  const startDate = combineToLocalDate(date, startTime);
  const endDate = combineToLocalDate(date, endTime);

  if (endDate <= startDate) {
    return 'End time must be later than start time.';
  }

  const durationMinutes = (endDate.getTime() - startDate.getTime()) / 60000;
  if (durationMinutes < MIN_SESSION_MINUTES) {
    return `Sessions must be at least ${MIN_SESSION_MINUTES} minutes long.`;
  }
  if (durationMinutes > MAX_SESSION_MINUTES) {
    return `Sessions can be up to ${MAX_SESSION_MINUTES / 60} hours long.`;
  }

  // Same-day past-time check. Compare in local time only — the backend has
  // a 1-hour past tolerance, so requiring `>= now` on the client gives a
  // safe margin even after the picker close + submit round-trip.
  const today = toDateString(now);
  if (date === today && startDate < now) {
    return 'Choose a future start time.';
  }

  return null;
}

// ─── Backend error mapping ───────────────────────────────────────────────────

/**
 * Translate raw backend error text into copy that's safe to surface to the
 * user. Unknown errors fall back to a generic retry message instead of
 * leaking schema-level wording (e.g. "starts_at cannot be more than 1 hour
 * in the past").
 */
export function mapBackendError(raw: string | null | undefined): string {
  const text = (raw ?? '').toLowerCase();
  if (!text) return "Couldn't propose this session. Please try again.";
  if (/starts_at.*past|in the past/.test(text)) {
    return 'Choose a future start time.';
  }
  if (/ends_at.*after.*starts_at|end.*after.*start/.test(text)) {
    return 'End time must be later than start time.';
  }
  if (/overlap/.test(text)) {
    return 'You already have a session at this time.';
  }
  if (/venue.*not found|venue_id/.test(text)) {
    return "That court isn't available. Pick another or type a location.";
  }
  return "Couldn't propose this session. Please try again.";
}
