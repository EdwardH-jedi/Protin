import { useEffect, useRef } from 'react';
import anime from 'animejs';
import { useReducedMotion } from './useReducedMotion';

type RevealOptions = {
  /** ms between siblings — default 90ms */
  stagger?: number;
  /** ms per element — default 700 */
  duration?: number;
  /** vertical offset to translate up from — default 24px */
  translateY?: number;
  /** delay before the whole reveal starts — default 0 */
  delay?: number;
  /** CSS selector for child elements that should reveal individually.
   *  When omitted, the container itself is revealed. */
  childSelector?: string;
  /** IntersectionObserver threshold — default 0.18 */
  threshold?: number;
};

/**
 * Returns a ref. Attach it to a container, optionally pass a `childSelector`
 * to stagger the reveal across that container's children, and the hook will:
 *
 *  - leave reveal targets hidden (the global `[data-reveal]` rule does that)
 *  - watch the container with IntersectionObserver
 *  - on first intersection, animate opacity 0→1 + translateY 24→0 with the
 *    requested stagger
 *  - if the user prefers reduced motion, instantly mark targets visible
 *    without ever calling anime.js
 *
 * Animations only target `opacity` and `transform`, so they never trigger
 * layout. Each target is animated exactly once.
 */
export function useAnimeReveal<T extends HTMLElement = HTMLElement>(
  opts: RevealOptions = {}
) {
  const ref = useRef<T | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const targets: HTMLElement[] = opts.childSelector
      ? Array.from(container.querySelectorAll<HTMLElement>(opts.childSelector))
      : [container];

    if (targets.length === 0) return;

    // Make sure each target carries the data-reveal initial-state attribute,
    // so even targets defined after the CSS pass start hidden consistently.
    targets.forEach((el) => el.setAttribute('data-reveal', ''));

    if (reduced) {
      // Reduced motion: skip anime.js entirely, just snap to visible.
      targets.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
        el.removeAttribute('data-reveal');
      });
      return;
    }

    const snapVisible = () => {
      targets.forEach((el) => {
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
        instance = anime({
          targets,
          opacity: [0, 1],
          translateY: [opts.translateY ?? 24, 0],
          easing: 'cubicBezier(0.22, 1, 0.36, 1)',
          duration: opts.duration ?? 700,
          delay: anime.stagger(opts.stagger ?? 90, { start: opts.delay ?? 0 }),
          complete: () => {
            targets.forEach((el) => el.removeAttribute('data-reveal'));
          },
        });
      } catch {
        // Defensive: if anime ever throws (e.g. weird target shape) we
        // must NOT leave reveal targets permanently invisible.
        snapVisible();
      }
    };

    if (typeof IntersectionObserver === 'undefined') {
      // No IntersectionObserver support — fall back to immediate play.
      play();
      return () => {
        if (instance) instance.pause();
        anime.remove(targets);
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
      { threshold: opts.threshold ?? 0.18 }
    );
    observer.observe(container);

    return () => {
      observer.disconnect();
      if (instance) instance.pause();
      anime.remove(targets);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return ref;
}
