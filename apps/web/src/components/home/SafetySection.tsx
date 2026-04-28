import { ShieldCheck, Flag, Star, Lock, UserCheck } from 'lucide-react';
import { useAnimeReveal } from '@/hooks/useAnimeReveal';

const features = [
  {
    title: 'Verified profiles',
    description:
      'Email, phone, and optional ID verification. Know who you are meeting.',
    icon: UserCheck,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    title: 'Report & moderation',
    description:
      'Report inappropriate behavior any time. Moderation reviews and acts.',
    icon: Flag,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
  },
  {
    title: 'Community ratings',
    description:
      'Rate your experience after each session. Reputation builds trust.',
    icon: Star,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  {
    title: 'Honor system',
    description:
      'Consistent positive ratings unlock badges and exclusive events.',
    icon: ShieldCheck,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    title: 'Private group options',
    description:
      'Create invite-only sessions with people you already trust.',
    icon: Lock,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
];

export function SafetySection() {
  const gridRef = useAnimeReveal<HTMLDivElement>({
    childSelector: '[data-card]',
    stagger: 80,
  });

  return (
    <section className="bg-gradient-to-b from-slate-50 to-white py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <span className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg">
            <ShieldCheck className="h-8 w-8 text-white" />
          </span>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
            Trust & safety first
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600 sm:text-xl">
            Meet with confidence. Every feature is designed to keep our
            community safe, respectful, and authentic.
          </p>
        </div>

        <div
          ref={gridRef}
          className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                data-card
                data-reveal
                className="group rounded-2xl border border-slate-200 bg-white p-7 transition hover:border-slate-300 hover:shadow-xl"
              >
                <span
                  className={`mb-5 inline-flex h-14 w-14 items-center justify-center rounded-xl ${feature.bg} transition-transform duration-300 group-hover:scale-110`}
                >
                  <Icon className={`h-7 w-7 ${feature.color}`} />
                </span>
                <h3 className="text-xl font-bold text-slate-900">
                  {feature.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-slate-600">
                  {feature.description}
                </p>
              </article>
            );
          })}
        </div>

        <div className="mx-auto mt-14 max-w-3xl rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 p-8 text-center shadow-xl md:p-12">
          <h3 className="text-2xl font-bold text-white sm:text-3xl">
            Your safety is our priority
          </h3>
          <p className="mt-3 text-base leading-relaxed text-slate-300 sm:text-lg">
            We are building a community where people feel empowered to stay
            active, meet new people, and trust that everyone is here for the
            right reasons.
          </p>
        </div>
      </div>
    </section>
  );
}
