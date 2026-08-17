import { Zap } from 'lucide-react';
import { useAnimeReveal } from '@/hooks/useAnimeReveal';
import { SiteFooter } from '@/components/SiteFooter';
import { WaitlistForm } from './WaitlistForm';

export function FinalCTA() {
  const blockRef = useAnimeReveal<HTMLDivElement>({
    childSelector: '[data-final]',
    stagger: 110,
    duration: 720,
  });

  return (
    <section className="bg-final-cta relative overflow-hidden py-32">
      <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8">
        <div ref={blockRef} className="mx-auto max-w-4xl text-center">
          <span
            data-final
            data-reveal
            aria-hidden="true"
            className="mb-7 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 shadow-2xl"
          >
            <Zap className="h-8 w-8 text-white" />
          </span>

          <h2
            data-final
            data-reveal
            className="text-4xl font-bold leading-tight text-white sm:text-5xl md:text-6xl lg:text-7xl"
          >
            Ready to move with people who match
            <span className="text-gradient-brand mt-2 block">your energy?</span>
          </h2>

          <p
            data-final
            data-reveal
            className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-slate-300 sm:text-xl"
          >
            Join the waitlist. Be first to connect when SportsGang launches in
            your city.
          </p>

          <div data-final data-reveal className="mt-10">
            <WaitlistForm variant="cta" />
          </div>

          <ul
            data-final
            data-reveal
            className="mx-auto mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-300"
          >
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>Free to join</span>
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-blue-400" />
              <span>Sydney first</span>
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-purple-400" />
              <span>Early access perks</span>
            </li>
          </ul>
        </div>
      </div>
      <SiteFooter />
    </section>
  );
}
