import { useEffect, useId, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  hasJoinedWaitlist,
  isValidEmail,
  submitWaitlistEmail,
} from '@/lib/waitlist';

type Variant = 'hero' | 'cta';

interface WaitlistFormProps {
  variant?: Variant;
  /** Optional: parent gets notified after a successful submission. */
  onSuccess?: (email: string) => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; message: string }
  | { kind: 'already'; message: string };

const MESSAGES = {
  empty: 'Enter your email to join the waitlist.',
  invalid: 'Please enter a valid email address.',
  already: "You're already on the SportsGang waitlist on this device.",
  success: "You're on the list — we'll let you know when SportsGang opens.",
} as const;

const VARIANT_STYLES: Record<
  Variant,
  {
    inputClass: string;
    buttonClass: string;
    buttonLabel: string;
    showArrow: boolean;
    statusOnDark: boolean;
  }
> = {
  hero: {
    inputClass:
      'flex-1 rounded-xl border border-white/20 bg-white/10 px-5 py-3.5 text-base text-white placeholder-slate-400 backdrop-blur-sm transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-60',
    buttonClass:
      'btn-gradient rounded-xl px-6 py-3.5 text-base font-semibold text-white shadow-lg transition hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-70',
    buttonLabel: 'Join the waitlist',
    showArrow: false,
    statusOnDark: true,
  },
  cta: {
    inputClass:
      'flex-1 rounded-xl border-2 border-white/20 bg-white/10 px-6 py-4 text-base text-white placeholder-slate-400 backdrop-blur-md transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:opacity-60',
    buttonClass:
      'group inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 px-7 py-4 text-base font-semibold text-white shadow-2xl transition hover:from-blue-600 hover:via-indigo-600 hover:to-purple-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-70',
    buttonLabel: 'Join the waitlist',
    showArrow: true,
    statusOnDark: true,
  },
};

/**
 * Reusable waitlist form. TEMPORARY no-backend prototype:
 * `submitWaitlistEmail` validates and persists to localStorage; there is no
 * network call. See `src/lib/waitlist.ts`.
 *
 * - Validates email client-side; surfaces messages via `aria-live="polite"`
 * - Disables the submit button while handling the submission
 * - Dedupes per browser via localStorage (first submission wins)
 * - Picks up an existing localStorage entry on mount so reloads still show
 *   the "you're on the list" state instead of asking again
 */
export function WaitlistForm({ variant = 'hero', onSuccess }: WaitlistFormProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const inputId = useId();
  const statusId = useId();
  const styles = VARIANT_STYLES[variant];

  // If this browser already has a record, show the "already joined" state
  // immediately so reloading the page doesn't reset the user back to the
  // "ask for email" form.
  useEffect(() => {
    if (hasJoinedWaitlist()) {
      setStatus({ kind: 'already', message: MESSAGES.already });
    }
  }, []);

  const isLocked = status.kind === 'success' || status.kind === 'already';
  const isSubmitting = status.kind === 'submitting';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || isSubmitting) return;

    setStatus({ kind: 'submitting' });

    // Yield a tick so the disabled state can render even on synchronous
    // localStorage paths — keeps the UX honest if/when this becomes async.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

    if (email.trim().length === 0) {
      setStatus({ kind: 'error', message: MESSAGES.empty });
      return;
    }
    if (!isValidEmail(email)) {
      setStatus({ kind: 'error', message: MESSAGES.invalid });
      return;
    }

    const result = submitWaitlistEmail(email);
    if (!result.ok) {
      setStatus({
        kind: 'error',
        message: result.reason === 'empty' ? MESSAGES.empty : MESSAGES.invalid,
      });
      return;
    }

    if (result.alreadyJoined) {
      setStatus({ kind: 'already', message: MESSAGES.already });
    } else {
      setStatus({ kind: 'success', message: MESSAGES.success });
      onSuccess?.(result.email);
    }
    setEmail('');
  };

  const buttonLabel = (() => {
    if (isSubmitting) return 'Submitting…';
    if (status.kind === 'success') return "You're in!";
    if (status.kind === 'already') return "Already joined";
    return styles.buttonLabel;
  })();

  // Status text is colored for both light and dark backgrounds. All forms in
  // this app sit on dark hero/cta gradients, so we tune for that.
  const statusToneClass =
    status.kind === 'error'
      ? 'text-rose-300'
      : status.kind === 'success'
        ? 'text-emerald-300'
        : status.kind === 'already'
          ? 'text-blue-200'
          : 'text-slate-300';

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Join the SportsGang waitlist"
      className="mx-auto w-full"
    >
      <div
        className={
          variant === 'hero'
            ? 'mx-auto flex max-w-md flex-col gap-3 sm:flex-row'
            : 'mx-auto flex max-w-xl flex-col gap-3 sm:flex-row'
        }
      >
        <label htmlFor={inputId} className="sr-only">
          Email address
        </label>
        <input
          id={inputId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            // Clear any stale error message as soon as the user keeps typing.
            if (status.kind === 'error') setStatus({ kind: 'idle' });
          }}
          placeholder={
            isLocked ? 'You’re on the list ✨' : 'you@example.com'
          }
          aria-invalid={status.kind === 'error'}
          aria-describedby={statusId}
          disabled={isSubmitting || isLocked}
          className={styles.inputClass}
        />
        <button
          type="submit"
          disabled={isSubmitting || isLocked}
          className={styles.buttonClass}
        >
          <span>{buttonLabel}</span>
          {styles.showArrow && !isLocked && !isSubmitting && (
            <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
          )}
        </button>
      </div>

      {/*
        aria-live="polite" + role="status" so screen readers announce
        validation results and success/already-joined states as they
        change. Always-rendered (with min-height) to avoid layout shift
        when a status appears.
      */}
      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className={`mt-3 min-h-[1.25rem] text-center text-sm ${statusToneClass}`}
      >
        {status.kind === 'idle' || status.kind === 'submitting'
          ? ''
          : status.message}
      </p>
    </form>
  );
}
