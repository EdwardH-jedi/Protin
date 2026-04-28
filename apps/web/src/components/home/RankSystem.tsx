import { useEffect, useRef } from 'react';
import anime from 'animejs';
import { Award, Star, Sparkles, ThumbsUp, ShieldCheck, TrendingUp } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

type Rank = {
  name: string;
  hint: string;
  gradient: string;
  ring: string;
};

const ranks: Rank[] = [
  {
    name: 'Bronze',
    hint: 'New member',
    gradient: 'from-orange-400 to-amber-700',
    ring: 'ring-amber-700/40',
  },
  {
    name: 'Silver',
    hint: 'Active player',
    gradient: 'from-slate-300 to-slate-500',
    ring: 'ring-slate-500/40',
  },
  {
    name: 'Gold',
    hint: 'Regular contributor',
    gradient: 'from-yellow-300 to-yellow-600',
    ring: 'ring-yellow-600/40',
  },
  {
    name: 'Platinum',
    hint: 'Community leader',
    gradient: 'from-cyan-300 to-blue-500',
    ring: 'ring-blue-500/40',
  },
  {
    name: 'Diamond',
    hint: 'Elite member',
    gradient: 'from-purple-400 via-pink-400 to-blue-400',
    ring: 'ring-purple-500/40',
  },
];

const honorPoints = [
  {
    title: 'Post-match ratings',
    description:
      'Every session ends with a quick rating. Honest feedback shapes your reputation over time.',
    icon: Star,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  {
    title: 'Good-manner recognition',
    description:
      'Show up on time, communicate clearly, play fairly — and earn manner badges from the community.',
    icon: ThumbsUp,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    title: 'Community trust signals',
    description:
      'Higher ranks unlock priority matching, exclusive tournaments, and trusted-member visibility.',
    icon: ShieldCheck,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
];

export function RankSystem() {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement | null>(null);
  const badgesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = sectionRef.current;
    const badgesContainer = badgesRef.current;
    if (!root || !badgesContainer) return;

    const badges =
      badgesContainer.querySelectorAll<HTMLElement>('[data-badge]');
    if (badges.length === 0) return;

    if (reduced) {
      badges.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
        el.removeAttribute('data-reveal');
      });
      return;
    }

    const snapVisible = () => {
      badges.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
        el.removeAttribute('data-reveal');
      });
    };

    let played = false;
    let instance: anime.AnimeInstance | null = null;
    const play = () => {
      if (played) return;
      played = true;

      try {
        // Sequential reveal: scale + fade up, with a tiny rotate so each
        // badge feels like it "lands" rather than just popping in.
        // Premium-sports tone, not game-reward tone — short durations,
        // soft easing.
        instance = anime({
          targets: Array.from(badges),
          opacity: [0, 1],
          translateY: [16, 0],
          scale: [0.85, 1],
          rotate: [-6, 0],
          easing: 'cubicBezier(0.22, 1, 0.36, 1)',
          duration: 520,
          delay: anime.stagger(170),
          complete: () => {
            badges.forEach((el) => el.removeAttribute('data-reveal'));
          },
        });
      } catch {
        snapVisible();
      }
    };

    if (typeof IntersectionObserver === 'undefined') {
      play();
      return () => {
        if (instance) instance.pause();
        anime.remove(Array.from(badges));
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            play();
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(badgesContainer);
    return () => {
      observer.disconnect();
      if (instance) instance.pause();
      anime.remove(Array.from(badges));
    };
  }, [reduced]);

  return (
    <section
      ref={sectionRef}
      className="bg-gradient-to-b from-white via-slate-50 to-white py-24"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-14 text-center">
          <span className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
            <Award className="h-8 w-8 text-white" />
          </span>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
            Ranking & honor system
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600 sm:text-xl">
            Show up, play well, earn your place. Your rank reflects your
            commitment, your manner, and your community trust.
          </p>
        </div>

        <div ref={badgesRef} className="mx-auto mb-16 max-w-5xl">
          <ol className="flex flex-wrap items-end justify-center gap-6 sm:gap-10">
            {ranks.map((rank) => (
              <li
                key={rank.name}
                data-badge
                data-reveal
                className="flex flex-col items-center text-center"
              >
                <span
                  className={`flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br ${rank.gradient} shadow-xl ring-4 ${rank.ring} sm:h-28 sm:w-28`}
                >
                  <Award className="h-9 w-9 text-white sm:h-11 sm:w-11" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-slate-900 sm:text-lg">
                  {rank.name}
                </h3>
                <p className="text-sm text-slate-500">{rank.hint}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {honorPoints.map((point) => {
            const Icon = point.icon;
            return (
              <article
                key={point.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <span
                  className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${point.bg}`}
                >
                  <Icon className={`h-6 w-6 ${point.color}`} />
                </span>
                <h4 className="text-lg font-bold text-slate-900">
                  {point.title}
                </h4>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {point.description}
                </p>
              </article>
            );
          })}
        </div>

        <div className="mx-auto mt-12 max-w-4xl rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 p-8 text-center shadow-xl">
          <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
            <TrendingUp className="h-5 w-5 text-white" />
          </span>
          <h3 className="text-2xl font-bold text-white sm:text-3xl">
            Build your reputation
          </h3>
          <p className="mt-3 text-base text-indigo-100 sm:text-lg">
            The most consistent, respectful, and engaged members rise to the
            top — and get recognized for it.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-indigo-100">
            <Sparkles className="h-3.5 w-3.5" /> Premium recognition
          </span>
        </div>
      </div>
    </section>
  );
}
