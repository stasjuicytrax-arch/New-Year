import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
export const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

let lenis: Lenis | null = null;

/** Плавный скролл Lenis, синхронизированный с ScrollTrigger. При reduced-motion не включается. */
export function initScroll(): Lenis | null {
  if (reducedMotion.matches) return null;

  lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

export function scrollToTarget(target: string | HTMLElement, offset = 0): void {
  if (lenis) lenis.scrollTo(target, { offset, duration: 1.4 });
  else (typeof target === 'string' ? document.querySelector(target) : target)?.scrollIntoView();
}

export function lockScroll(lock: boolean): void {
  if (lenis) lock ? lenis.stop() : lenis.start();
  document.documentElement.style.overflow = lock ? 'hidden' : '';
}

export { gsap, ScrollTrigger, SplitText };
