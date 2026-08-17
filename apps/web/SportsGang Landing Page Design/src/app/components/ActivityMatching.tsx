import { Dumbbell, Trophy, Users, Bike, Target, CalendarDays } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';

const activities = [
  {
    title: 'Gym',
    description: 'Find lifting partners, share routines, spot each other.',
    icon: Dumbbell,
    image: 'https://images.unsplash.com/photo-1750521280541-bbf9d813a890?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxneW0lMjB3b3Jrb3V0JTIwcGVvcGxlJTIwZml0bmVzc3xlbnwxfHx8fDE3NzczNTg2MTV8MA&ixlib=rb-4.1.0&q=80&w=1080',
    gradient: 'from-orange-500 to-red-600'
  },
  {
    title: 'Golf',
    description: 'Fill your foursome, track rounds, play new courses.',
    icon: Trophy,
    image: 'https://images.unsplash.com/photo-1776717163992-1919b844d715?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnb2xmJTIwY291cnNlJTIwcGxheWVyfGVufDF8fHx8MTc3NzM1ODYxNnww&ixlib=rb-4.1.0&q=80&w=1080',
    gradient: 'from-green-500 to-emerald-700'
  },
  {
    title: 'Running',
    description: 'Join running crews, pace groups, early morning miles.',
    icon: Bike,
    image: 'https://images.unsplash.com/photo-1775388192614-1204fcacf0ec?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwzfHxydW5uaW5nJTIwb3V0ZG9vciUyMGF0aGxldGVzfGVufDF8fHx8MTc3NzM1ODYxNnww&ixlib=rb-4.1.0&q=80&w=1080',
    gradient: 'from-blue-500 to-cyan-600'
  },
  {
    title: 'Badminton',
    description: 'Match your skill level, doubles partners, drop-in games.',
    icon: Target,
    image: 'https://images.unsplash.com/photo-1774599467191-04e2c399a117?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZW5uaXMlMjBiYWRtaW50b24lMjBjb3VydHxlbnwxfHx8fDE3NzczNTg2MTZ8MA&ixlib=rb-4.1.0&q=80&w=1080',
    gradient: 'from-purple-500 to-pink-600'
  },
  {
    title: 'Tennis',
    description: 'Singles, doubles, practice partners at your level.',
    icon: Target,
    image: 'https://images.unsplash.com/photo-1758634025517-782312745372?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwyfHx0ZW5uaXMlMjBiYWRtaW50b24lMjBjb3VydHxlbnwxfHx8fDE3NzczNTg2MTZ8MA&ixlib=rb-4.1.0&q=80&w=1080',
    gradient: 'from-yellow-500 to-orange-600'
  },
  {
    title: 'Group Events',
    description: 'Tournaments, leagues, social runs, team competitions.',
    icon: CalendarDays,
    image: 'https://images.unsplash.com/photo-1769876457918-1871f21d63bc?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwyfHxydW5uaW5nJTIwb3V0ZG9vciUyMGF0aGxldGVzfGVufDF8fHx8MTc3NzM1ODYxNnww&ixlib=rb-4.1.0&q=80&w=1080',
    gradient: 'from-indigo-500 to-purple-600'
  }
];

export function ActivityMatching() {
  return (
    <section className="py-24 bg-gradient-to-b from-white to-slate-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Your sport. Your way.
          </h2>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Match with people who share your passion and play at your level.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {activities.map((activity, index) => {
            const Icon = activity.icon;
            return (
              <div
                key={activity.title}
                className="group relative overflow-hidden rounded-2xl bg-white shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:scale-105 cursor-pointer"
                style={{
                  animationDelay: `${index * 0.1}s`
                }}
              >
                <div className="aspect-[4/3] overflow-hidden">
                  <ImageWithFallback
                    src={activity.image}
                    alt={activity.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                </div>

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-300"></div>

                <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${activity.gradient} mb-3 shadow-lg`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">{activity.title}</h3>
                  <p className="text-slate-200 leading-relaxed">{activity.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
