import { User, Target, Users, Play } from 'lucide-react';

const steps = [
  {
    number: '01',
    title: 'Create your profile',
    description: 'Share your fitness journey, goals, and what drives you. Add your photo, location, and availability.',
    icon: User,
    color: 'from-blue-500 to-cyan-500'
  },
  {
    number: '02',
    title: 'Choose sports & skill level',
    description: 'Select from 20+ activities. Set your experience level so we match you with the right people.',
    icon: Target,
    color: 'from-purple-500 to-pink-500'
  },
  {
    number: '03',
    title: 'Match or join groups',
    description: 'Swipe to connect 1-on-1, or join existing sessions and events happening near you.',
    icon: Users,
    color: 'from-orange-500 to-red-500'
  },
  {
    number: '04',
    title: 'Meet and play',
    description: 'Coordinate the details, show up, and start building your fitness community in real life.',
    icon: Play,
    color: 'from-green-500 to-emerald-500'
  }
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            How it works
          </h2>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            From sign-up to first session in minutes. No complexity, just connections.
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="relative flex flex-col md:flex-row gap-8 mb-16 last:mb-0"
              >
                {index !== steps.length - 1 && (
                  <div className="hidden md:block absolute left-16 top-24 bottom-0 w-0.5 bg-gradient-to-b from-slate-200 to-transparent"></div>
                )}

                <div className="flex-shrink-0">
                  <div className={`relative w-32 h-32 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-xl transform hover:scale-105 transition-transform duration-300`}>
                    <Icon className="w-12 h-12 text-white" />
                    <div className="absolute -top-3 -right-3 w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg">
                      <span className="text-sm font-bold text-slate-900">{step.number}</span>
                    </div>
                  </div>
                </div>

                <div className="flex-1 pt-4">
                  <h3 className="text-3xl font-bold text-slate-900 mb-3">
                    {step.title}
                  </h3>
                  <p className="text-lg text-slate-600 leading-relaxed max-w-xl">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
