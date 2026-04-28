import { Dumbbell, Trophy, Activity, Target, Send, CalendarDays } from 'lucide-react';
import { useAnimeReveal } from '@/hooks/useAnimeReveal';

type Activity = {
  title: string;
  description: string;
  icon: typeof Dumbbell;
  image: string;
  gradient: string;
};

const activities: Activity[] = [
  {
    title: 'Gym',
    description: 'Find lifting partners, share routines, spot each other.',
    icon: Dumbbell,
    image:
      'https://images.unsplash.com/photo-1750521280541-bbf9d813a890?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    gradient: 'from-orange-500 to-red-600',
  },
  {
    title: 'Golf',
    description: 'Fill your foursome, track rounds, play new courses.',
    icon: Trophy,
    image:
      'https://images.unsplash.com/photo-1776717163992-1919b844d715?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    gradient: 'from-green-500 to-emerald-700',
  },
  {
    title: 'Running',
    description: 'Join running crews, pace groups, early-morning miles.',
    icon: Activity,
    image:
      'https://images.unsplash.com/photo-1775388192614-1204fcacf0ec?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    gradient: 'from-blue-500 to-cyan-600',
  },
  {
    title: 'Badminton',
    description: 'Match your skill level, doubles partners, drop-in games.',
    icon: Send,
    image:
      'https://images.unsplash.com/photo-1774599467191-04e2c399a117?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    gradient: 'from-purple-500 to-pink-600',
  },
  {
    title: 'Tennis',
    description: 'Singles, doubles, practice partners at your level.',
    icon: Target,
    image:
      'https://images.unsplash.com/photo-1758634025517-782312745372?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    gradient: 'from-yellow-500 to-orange-600',
  },
  {
    title: 'Group Events',
    description: 'Tournaments, leagues, social runs, team competitions.',
    icon: CalendarDays,
    image:
      'https://images.unsplash.com/photo-1769876457918-1871f21d63bc?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080',
    gradient: 'from-indigo-500 to-purple-600',
  },
];

export function ActivityCards() {
  const gridRef = useAnimeReveal<HTMLDivElement>({
    childSelector: '[data-card]',
    stagger: 90,
  });

  return (
    <section className="bg-gradient-to-b from-white to-slate-50 py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-14 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
            Your sport. Your way.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600 sm:text-xl">
            Match with people who share your passion and play at your level.
          </p>
        </div>

        <div
          ref={gridRef}
          className="mx-auto grid max-w-7xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {activities.map((activity) => {
            const Icon = activity.icon;
            return (
              <article
                key={activity.title}
                data-card
                data-reveal
                className="group relative cursor-default overflow-hidden rounded-2xl bg-white shadow-md transition-shadow duration-500 hover:shadow-2xl"
              >
                <div className="aspect-[4/3] overflow-hidden">
                  <img
                    src={activity.image}
                    alt={activity.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-90" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                  <span
                    className={`mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${activity.gradient} shadow-lg`}
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="text-2xl font-bold">{activity.title}</h3>
                  <p className="mt-2 leading-relaxed text-slate-200">
                    {activity.description}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
