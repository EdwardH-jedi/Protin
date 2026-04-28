import { Users, Lock, Globe, UserCircle2 } from 'lucide-react';

const eventTypes = [
  {
    title: 'Badminton rooms',
    description: '4-player doubles matches with skill-based pairing',
    icon: Users,
    spots: '4 players',
    color: 'from-purple-500 to-pink-600'
  },
  {
    title: 'Golf foursomes',
    description: 'Complete your group for 18 holes at local courses',
    icon: Users,
    spots: '4 players',
    color: 'from-green-500 to-emerald-600'
  },
  {
    title: 'Running groups',
    description: 'Morning runs, interval training, marathon prep crews',
    icon: Users,
    spots: '3-12 runners',
    color: 'from-blue-500 to-cyan-600'
  }
];

const privacyOptions = [
  {
    title: 'Public groups',
    description: 'Open to anyone in your area who matches the skill level',
    icon: Globe,
    color: 'text-blue-600',
    bg: 'bg-blue-50'
  },
  {
    title: 'Private groups',
    description: 'Invite-only sessions with your approved contacts',
    icon: Lock,
    color: 'text-purple-600',
    bg: 'bg-purple-50'
  },
  {
    title: 'Gender preferences',
    description: 'Set preferences for all-male, all-female, or mixed sessions',
    icon: UserCircle2,
    color: 'text-pink-600',
    bg: 'bg-pink-50'
  }
];

export function GroupEvents() {
  return (
    <section className="py-24 bg-gradient-to-b from-white to-slate-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Group events & sessions
          </h2>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Some sports are better in groups. Create or join multi-player sessions designed for team play.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-20">
          {eventTypes.map((event, index) => {
            const Icon = event.icon;
            return (
              <div
                key={event.title}
                className="relative overflow-hidden rounded-2xl bg-white shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:scale-105 group"
                style={{
                  animationDelay: `${index * 0.1}s`
                }}
              >
                <div className={`h-2 bg-gradient-to-r ${event.color}`}></div>
                <div className="p-8">
                  <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br ${event.color} mb-5 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">
                    {event.title}
                  </h3>
                  <p className="text-slate-600 mb-4 leading-relaxed">
                    {event.description}
                  </p>
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full">
                    <Users className="w-4 h-4 text-slate-600" />
                    <span className="text-sm font-medium text-slate-700">{event.spots}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="max-w-5xl mx-auto">
          <h3 className="text-3xl font-bold text-slate-900 mb-8 text-center">
            Flexible privacy settings
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {privacyOptions.map((option, index) => {
              const Icon = option.icon;
              return (
                <div
                  key={option.title}
                  className="p-6 rounded-xl bg-white border-2 border-slate-200 hover:border-slate-300 transition-all duration-300"
                  style={{
                    animationDelay: `${index * 0.1}s`
                  }}
                >
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${option.bg} mb-4`}>
                    <Icon className={`w-6 h-6 ${option.color}`} />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 mb-2">
                    {option.title}
                  </h4>
                  <p className="text-slate-600 text-sm leading-relaxed">
                    {option.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-16 max-w-3xl mx-auto bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-8 md:p-12 text-center shadow-2xl">
          <Users className="w-12 h-12 text-white mx-auto mb-4" />
          <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Never play alone again
          </h3>
          <p className="text-slate-300 text-lg leading-relaxed">
            Whether you need one more for doubles or want to organize a weekend tournament, Protin makes group coordination effortless.
          </p>
        </div>
      </div>
    </section>
  );
}
