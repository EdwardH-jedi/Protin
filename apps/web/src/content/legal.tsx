import { AlertTriangle, Mail } from 'lucide-react';

/**
 * Placeholder copy for Privacy / Terms / Contact dialogs surfaced from the
 * site footer. This is *draft-only* content — final wording must come
 * from a legal review before public launch.
 */

function DraftBanner() {
  return (
    <p className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <AlertTriangle
        className="mt-0.5 h-4 w-4 flex-shrink-0"
        aria-hidden="true"
      />
      <span>
        <strong>Draft policy — final legal review required before launch.</strong>{' '}
        This text is a placeholder so the site is not pointing to dead links.
        Real Privacy Policy and Terms of Service must be reviewed by qualified
        counsel and replace this content before SportsGang is published.
      </span>
    </p>
  );
}

export function PrivacyContent() {
  return (
    <div className="space-y-4">
      <DraftBanner />
      <p>
        SportsGang is a fitness-first social product. We expect to collect: account
        information you provide (email, name, profile fields), activity data
        you share with the app (sports, skill level, suburb, photos), and basic
        device telemetry needed to keep the service working safely.
      </p>
      <p>
        We do not sell personal data to advertisers. We use information to run
        matching, surface relevant events, moderate the community, and improve
        the product. Photos and profile content you create are visible to other
        SportsGang users in line with the privacy settings you choose.
      </p>
      <p>
        You can request export or deletion of your account at any time from
        within the app. Account deletion removes your profile, matches, chat
        history, and bookings as required by Apple Guideline 5.1.1(v).
      </p>
      <p>
        Final policy will detail: legal basis for processing (GDPR/Australian
        Privacy Act), data retention windows, sub-processors, security
        controls, and contact information for privacy requests.
      </p>
    </div>
  );
}

export function TermsContent() {
  return (
    <div className="space-y-4">
      <DraftBanner />
      <p>
        By creating a SportsGang account, you agree to use the service to find and
        coordinate real-world fitness and sports activities. SportsGang is a
        fitness-first product — it is not a dating service. Misusing the
        platform for harassment, hate, sexualised content, scams, or unsafe
        meetups will result in account termination.
      </p>
      <p>
        You are responsible for the content you post (profile, photos, chat
        messages) and for any meetups you arrange through the service. Treat
        in-person meetups with the same care you would for any introduction
        with a person you have just met online — meet in public places when
        possible, share plans with someone you trust, and stop the meeting if
        you feel unsafe.
      </p>
      <p>
        SportsGang moderates reports submitted through the in-app reporting flow
        and reserves the right to suspend or terminate accounts that violate
        our community standards or applicable law.
      </p>
      <p>
        Final terms will cover: jurisdiction, dispute resolution, account
        termination, intellectual-property assignment for user-generated
        content, and limits of liability.
      </p>
    </div>
  );
}

interface ContactRowProps {
  label: string;
  email: string;
  description: string;
}

function ContactRow({ label, email, description }: ContactRowProps) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <a
        href={`mailto:${email}`}
        className="mt-1 inline-flex items-center gap-2 text-base font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Mail className="h-4 w-4" aria-hidden="true" />
        {email}
      </a>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </div>
  );
}

export function ContactContent() {
  return (
    <div className="space-y-4">
      <p className="text-base text-slate-700">
        Use the right address so we can route your message quickly. These are
        placeholders for the launch domain and should be confirmed with
        operations before public release.
      </p>
      <div className="grid gap-3">
        <ContactRow
          label="General"
          email="hello@sportsgang.app"
          description="Press, partnerships, and anything that doesn't fit elsewhere."
        />
        <ContactRow
          label="Support"
          email="support@sportsgang.app"
          description="App issues, account questions, billing — we aim to reply within two business days."
        />
        <ContactRow
          label="Partnerships"
          email="partnerships@sportsgang.app"
          description="Studios, clubs, brands, event organisers, and integrations."
        />
      </div>
    </div>
  );
}
