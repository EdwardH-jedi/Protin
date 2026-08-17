import { useEffect, useRef } from 'react';
import anime from 'animejs';
import { ChevronDown } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { WaitlistForm } from './WaitlistForm';

const HEADLINE_LEAD = ['Find', 'your', 'next'];
const HEADLINE_ACCENT = ['workout', 'partner.'];

const FLOATING_CHIPS = [
  { label: 'Gym', x: '6%', y: '22%' },
  { label: 'Golf', x: '88%', y: '18%' },
  { label: 'Running', x: '10%', y: '78%' },
  { label: 'Tennis', x: '85%', y: '74%' },
  { label: 'Badminton', x: '50%', y: '8%' },
];

export function HeroSection() {
  const reduced = useReducedMotion();

  const wordmarkRef = useRef<HTMLSpanElement | null>(null);
  const headlineRef = useRef<HTMLHeadingElement | null>(null);
  const subtitleRef = useRef<HTMLParagraphElement | null>(null);
  const ctaGroupRef = useRef<HTMLDivElement | null>(null);
  const chipsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (reduced) {
      // Reduced motion: snap every reveal target to its final state and skip
      // both the entrance timeline and the chip floating loop.
      [wordmarkRef.current, subtitleRef.current, ctaGroupRef.current].forEach(
        (el) => {
          if (!el) return;
          el.style.opacity = '1';
          el.style.transform = 'none';
          el.removeAttribute('data-reveal');
        }
      );
      const words =
        headlineRef.current?.querySelectorAll<HTMLElement>('[data-word]');
      words?.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
        el.removeAttribute('data-reveal');
      });
      const chips =
        chipsRef.current?.querySelectorAll<HTMLElement>('[data-chip]');
      chips?.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
        el.removeAttribute('data-reveal');
      });
      return;
    }

    const tl = anime.timeline({
      easing: 'cubicBezier(0.22, 1, 0.36, 1)',
    });

    if (wordmarkRef.current) {
      tl.add({
        targets: wordmarkRef.current,
        opacity: [0, 1],
        translateY: [-12, 0],
        duration: 600,
      });
    }

    const headlineWords =
      headlineRef.current?.querySelectorAll<HTMLElement>('[data-word]');
    if (headlineWords && headlineWords.length > 0) {
      tl.add(
        {
          targets: Array.from(headlineWords),
          opacity: [0, 1],
          translateY: [28, 0],
          duration: 700,
          delay: anime.stagger(80),
        },
        '-=300'
      );
    }

    if (subtitleRef.current) {
      tl.add(
        {
          targets: subtitleRef.current,
          opacity: [0, 1],
          translateY: [16, 0],
          duration: 600,
        },
        '-=400'
      );
    }

    if (ctaGroupRef.current) {
      tl.add(
        {
          targets: ctaGroupRef.current,
          opacity: [0, 1],
          translateY: [16, 0],
          scale: [0.97, 1],
          duration: 600,
        },
        '-=300'
      );
    }

    // Chips: fade-in once, then float gently on a forever loop. Capture the
    // float instance so we can pause+remove it on unmount — anime.remove
    // strips targets but the loop instance is what holds the rAF tick.
    const chipNodes = chipsRef.current?.querySelectorAll<HTMLElement>(
      '[data-chip]'
    );
    let floatInstance: anime.AnimeInstance | null = null;
    let chipsArr: HTMLElement[] = [];
    if (chipNodes && chipNodes.length > 0) {
      chipsArr = Array.from(chipNodes);
      tl.add(
        {
          targets: chipsArr,
          opacity: [0, 0.85],
          scale: [0.9, 1],
          duration: 500,
          delay: anime.stagger(60),
          complete: () => {
            chipsArr.forEach((el) => el.removeAttribute('data-reveal'));
          },
        },
        '-=400'
      );

      floatInstance = anime({
        targets: chipsArr,
        translateY: [
          { value: -8, duration: 2400 },
          { value: 8, duration: 2400 },
        ],
        easing: 'easeInOutSine',
        loop: true,
        direction: 'alternate',
        delay: anime.stagger(220),
      });
    }

    return () => {
      tl.pause();
      if (floatInstance) {
        floatInstance.pause();
      }
      const all: HTMLElement[] = [
        wordmarkRef.current,
        subtitleRef.current,
        ctaGroupRef.current,
      ].filter(Boolean) as HTMLElement[];
      if (chipsArr.length) all.push(...chipsArr);
      if (headlineWords) all.push(...Array.from(headlineWords));
      anime.remove(all);
    };
  }, [reduced]);

  const scrollToHowItWorks = () => {
    document
      .getElementById('how-it-works')
      ?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="bg-hero relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Floating activity chips — decorative, kept low-contrast. */}
      <div
        ref={chipsRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden md:block"
      >
        {FLOATING_CHIPS.map((chip) => (
          <span
            key={chip.label}
            data-chip
            data-reveal
            className="absolute rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-medium text-slate-200 backdrop-blur-sm"
            style={{ left: chip.x, top: chip.y }}
          >
            {chip.label}
          </span>
        ))}
      </div>

      <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <span
            ref={wordmarkRef}
            data-reveal
            className="inline-block rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 backdrop-blur-sm"
          >
            SportsGang · Fitness-first
          </span>

          <h1
            ref={headlineRef}
            className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl"
          >
            <span className="block">
              {HEADLINE_LEAD.map((word, i) => (
                <span key={`l-${i}`} data-word data-reveal className="inline-block">
                  {word}
                  {i < HEADLINE_LEAD.length - 1 && ' '}
                </span>
              ))}
            </span>
            <span className="text-gradient-brand mt-3 block">
              {HEADLINE_ACCENT.map((word, i) => (
                <span key={`a-${i}`} data-word data-reveal className="inline-block">
                  {word}
                  {i < HEADLINE_ACCENT.length - 1 && ' '}
                </span>
              ))}
            </span>
          </h1>

          <p
            ref={subtitleRef}
            data-reveal
            className="mx-auto mt-8 max-w-3xl text-lg leading-relaxed text-slate-300 sm:text-xl md:text-2xl"
          >
            SportsGang connects people through fitness, sports, and real-life
            activity — from gym sessions to golf rounds, running crews, and
            local events.
          </p>

          <div ref={ctaGroupRef} data-reveal className="mt-10">
            <WaitlistForm variant="hero" />

            <button
              type="button"
              onClick={scrollToHowItWorks}
              className="group mx-auto mt-6 flex items-center gap-2 rounded text-sm text-slate-300 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span>Explore how it works</span>
              <ChevronDown className="h-4 w-4 transition group-hover:translate-y-0.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Soft fade into the white sections below */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />
    </section>
  );
}
