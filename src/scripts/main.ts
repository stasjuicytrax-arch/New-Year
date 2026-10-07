import '../styles/base.css';
import '../styles/fonts.css';
import '../styles/tokens.css';
import '../styles/components/header.css';
import '../styles/sections/layout.css';

import { initScroll, scrollToTarget, ScrollTrigger } from './scroll';
import { renderSkeleton } from './sections/skeleton';

renderSkeleton();
initScroll();

// Якоря идут через Lenis, если он включён
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
  const id = a?.getAttribute('href');
  if (!a || !id || id === '#') return;
  const target = document.querySelector<HTMLElement>(id);
  if (!target) return;
  e.preventDefault();
  scrollToTarget(target);
  history.replaceState(null, '', id);
});

window.addEventListener('load', () => ScrollTrigger.refresh());
