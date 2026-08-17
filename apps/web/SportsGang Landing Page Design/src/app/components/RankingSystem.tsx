import { Award, TrendingUp } from 'lucide-react';

const ranks = [
  {
    name: 'Bronze',
    color: 'from-orange-400 to-amber-600',
    borderColor: 'border-amber-600',
    description: 'New member',
    sessions: '1-5 sessions'
  },
  {
    name: 'Silver',
    color: 'from-slate-300 to-slate-500',
    borderColor: 'border-slate-500',
    description: 'Active player',
    sessions: '6-15 sessions'
  },
  {
    name: 'Gold',
    color: 'from-yellow-300 to-yellow-600',
    borderColor: 'border-yellow-600',
    description: 'Regular contributor',
    sessions: '16-30 sessions'
  },
  {
    name: 'Platinum',
    color: 'from-cyan-300 to-blue-500',
    borderColor: 'border-blue-500',
    description: 'Community leader',
    sessions: '31-50 sessions'
  },
  {
    name: 'Diamond',
    color: 'from-purple-400 via-pink-400 to-blue-400',
    borderColor: 'border-purple-500',
    description: 'Elite member',
    sessions: '50+ sessions'
  }
];

export function RankingSystem() {
  return (
    <section className="py-24 bg-gradient-to-b from-white via-slate-50 to-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 mb-6">
            <Award className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Ranking & honor system
          </h2>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Show up, play well, and earn your place in the community. Your rank reflects your commitment and consistency.
          </p>
        </div>

        <div className="max-w-4xl mx-auto mb-16">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 overflow-x-auto pb-4">
            {ranks.map((rank, index) => (
              <div key={rank.name} className="flex-shrink-0 text-center">
                <div className={`w-24 h-24 md:w-28 md:h-28 rounded-full bg-gradient-to-br ${rank.color} flex items-center justify-center shadow-xl border-4 ${rank.borderColor} transform hover:scale-110 transition-all duration-300 mb-4`}>
                  <Award className="w-10 h-10 md:w-12 md:h-12 text-white" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">{rank.name}</h3>
                <p className="text-sm text-slate-600">{rank.sessions}</p>
                {index < ranks.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-full w-8 h-0.5 bg-slate-300"></div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-200">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  How you rank up
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  Complete sessions, maintain high ratings, show up on time, and contribute to the community. Each positive interaction moves you forward.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-200">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                <Award className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Unlock perks
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  Higher ranks get early access to events, exclusive tournaments, partner discounts, and priority matching with top-rated members.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 max-w-3xl mx-auto bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-8 text-center shadow-2xl">
          <h3 className="text-2xl font-bold text-white mb-3">
            Build your reputation
          </h3>
          <p className="text-indigo-100 text-lg">
            The most consistent, respectful, and engaged members rise to the top — and get recognized for it.
          </p>
        </div>
      </div>
    </section>
  );
}
