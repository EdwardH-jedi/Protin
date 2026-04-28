import { Users, Lock, Globe, UserCircle2 } from 'lucide-react';
import { useAnimeReveal } from '@/hooks/useAnimeReveal';

const eventTypes = [
  {
    title: 'Badminton 4-player rooms',
    description: 'Doubles matches with skill-based pairing.',
    spots: '4 players',
    color: 'from-purple-500 to-pink-600',
  },
  {
    title: 'Golf foursomes',
    description: 'Complete your group for 18 holes at local courses.',
    spots: '4 players',
    color: 'from-emerald-500 to-emerald-700',
  },
  {
    title: 'Running groups',
    description: 'Morning runs, intervals, marathon prep crews.',
    spots: '3–12 runners',
    color: 'from-blue-500 to-cyan-600',
  },
];

const privacyOptions = [
  {
    title: 'Public groups',
    description: 'Open to anyone in your area who matches the skill level.',
    icon: Globe,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    title: 'Private groups',
    description: 'Invite-only sessions with your approved contacts.',
    icon: Lock,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
  {
    title: 'Gender-preference or open groups',
    description:
      'All-male, all-female, mixed, or fully open — depending on the event settings.',
    icon: UserCircle2,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
  },
];

export function GroupEvents() {
  const eventsRef = useAnimeReveal<HTMLDivElement>({
    childSelector: '[data-event]',
    stagger: 110,
  });
  const privacyRef = useAnimeReveal<HTMLDivElement>({
    childSelector: '[data-privacy]',
    stagger: 90,
  });

  return (
    <section className="bg-gradient-to-b from-white to-slate-50 py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-14 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
            Group events & sports rooms
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600 sm:text-xl">
            Some sports are better in groups. Create or join multi-player
            rooms designed for team play.
          </p>
        </div>

        <div
          ref={eventsRef}
          className="mx-auto mb-20 grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-3"
        >
          {eventTypes.map((event) => (
            <article
              key={event.title}
              data-event
              data-reveal
              className="group overflow-hidden rounded-2xl bg-white shadow-md transition hover:shadow-2xl"
            >
              <div className={`h-2 bg-gradient-to-r ${event.color}`} />
              <div className="p-7">
                <span
                  className={`mb-5 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${event.color} shadow-lg transition-transform duration-300 group-hover:scale-110`}
                >
                  <Users className="h-7 w-7 text-white" />
                </span>
                <h3 className="text-xl font-bold text-slate-900 sm:text-2xl">
                  {event.title}
                </h3>
                <p className="mt-2 text-base leading-relaxed text-slate-600">
                  {event.description}
                </p>
                <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3.5 py-1.5">
                  <Users className="h-3.5 w-3.5 text-slate-600" />
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-700">
                    {event.spots}
                  </span>
                </span>
              </div>
            </article>
          ))}
        </div>

        <div className="mx-auto max-w-5xl">
          <h3 className="mb-8 text-center text-2xl font-bold text-slate-900 sm:text-3xl">
            Flexible privacy settings
          </h3>
          <div ref={privacyRef} className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {privacyOptions.map((option) => {
              const Icon = option.icon;
              return (
                <article
                  key={option.title}
                  data-privacy
                  data-reveal
                  className="rounded-2xl border-2 border-slate-200 bg-white p-6 transition hover:border-slate-300"
                >
                  <span
                    className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${option.bg}`}
                  >
                    <Icon className={`h-6 w-6 ${option.color}`} />
                  </span>
                  <h4 className="text-lg font-bold text-slate-900">
                    {option.title}
                  </h4>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {option.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-3xl rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 p-8 text-center shadow-xl md:p-12">
          <Users className="mx-auto h-10 w-10 text-white" />
          <h3 className="mt-3 text-2xl font-bold text-white sm:text-3xl">
            Never play alone again
          </h3>
          <p className="mt-3 text-base leading-relaxed text-slate-300 sm:text-lg">
            Whether you need one more for doubles or want to organize a
            weekend tournament, Protin makes group coordination effortless.
          </p>
        </div>
      </div>
    </section>
  );
}
