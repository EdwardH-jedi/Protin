import { User, Target, Users, Play } from 'lucide-react';
import { useAnimeReveal } from '@/hooks/useAnimeReveal';

const steps = [
  {
    number: '01',
    title: 'Create your profile',
    description:
      'Share your fitness journey, goals, and what drives you. Add your photo, location, and availability.',
    icon: User,
    color: 'from-blue-500 to-cyan-500',
  },
  {
    number: '02',
    title: 'Choose your sports & skill level',
    description:
      'Pick from gym, golf, running, badminton, tennis and more. Set your level so we match you with the right people.',
    icon: Target,
    color: 'from-indigo-500 to-purple-500',
  },
  {
    number: '03',
    title: 'Match with people or join groups',
    description:
      'Connect 1-on-1, or join existing sessions and events happening near you.',
    icon: Users,
    color: 'from-orange-500 to-rose-500',
  },
  {
    number: '04',
    title: 'Meet, play, and build your fitness circle',
    description:
      'Coordinate the details, show up, and build real-life community around the sport you love.',
    icon: Play,
    color: 'from-emerald-500 to-teal-500',
  },
];

export function HowItWorks() {
  const listRef = useAnimeReveal<HTMLDivElement>({
    childSelector: '[data-step]',
    stagger: 140,
    duration: 760,
  });

  return (
    <section id="how-it-works" className="bg-white py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
            How it works
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600 sm:text-xl">
            From sign-up to first session in minutes. No complexity — just
            connections.
          </p>
        </div>

        <div ref={listRef} className="mx-auto max-w-5xl">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                data-step
                data-reveal
                className="relative mb-14 flex flex-col gap-6 last:mb-0 md:flex-row md:gap-10"
              >
                {index !== steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute left-[3.75rem] top-28 hidden h-[calc(100%-2rem)] w-px bg-gradient-to-b from-slate-200 to-transparent md:block"
                  />
                )}

                <div className="flex-shrink-0">
                  <div
                    className={`relative flex h-28 w-28 items-center justify-center rounded-2xl bg-gradient-to-br ${step.color} shadow-xl`}
                  >
                    <Icon className="h-11 w-11 text-white" />
                    <span className="absolute -right-2.5 -top-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-md">
                      <span className="text-sm font-bold text-slate-900">
                        {step.number}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="pt-3">
                  <h3 className="text-2xl font-bold text-slate-900 sm:text-3xl">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
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
