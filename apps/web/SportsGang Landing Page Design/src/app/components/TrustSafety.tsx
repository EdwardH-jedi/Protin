import { ShieldCheck, Flag, Star, Lock, UserCheck } from 'lucide-react';

const features = [
  {
    title: 'Verified profiles',
    description: 'Email, phone, and optional ID verification. Know who you\'re meeting.',
    icon: UserCheck,
    color: 'text-blue-600',
    bg: 'bg-blue-50'
  },
  {
    title: 'Report system',
    description: '24/7 moderation. Report inappropriate behavior instantly and we take action.',
    icon: Flag,
    color: 'text-red-600',
    bg: 'bg-red-50'
  },
  {
    title: 'Community ratings',
    description: 'Rate your experience after each session. Reputation matters.',
    icon: Star,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50'
  },
  {
    title: 'Honor system',
    description: 'Consistent positive ratings unlock exclusive events and trusted badges.',
    icon: ShieldCheck,
    color: 'text-green-600',
    bg: 'bg-green-50'
  },
  {
    title: 'Private groups',
    description: 'Create invite-only sessions with people you already trust.',
    icon: Lock,
    color: 'text-purple-600',
    bg: 'bg-purple-50'
  }
];

export function TrustSafety() {
  return (
    <section className="py-24 bg-gradient-to-b from-slate-50 to-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 mb-6">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Trust & safety first
          </h2>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Meet with confidence. Every feature is designed to keep our community safe, respectful, and authentic.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="group p-8 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                style={{
                  animationDelay: `${index * 0.1}s`
                }}
              >
                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl ${feature.bg} mb-5 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className={`w-7 h-7 ${feature.color}`} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-16 max-w-3xl mx-auto">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-8 md:p-12 text-center shadow-2xl">
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
              Your safety is our priority
            </h3>
            <p className="text-slate-300 text-lg leading-relaxed">
              We're building a community where people feel empowered to stay active, meet new people, and trust that everyone is here for the right reasons.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
