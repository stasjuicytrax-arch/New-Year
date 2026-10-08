import '../styles/base.css';
import '../styles/fonts.css';
import '../styles/tokens.css';
import '../styles/components/header.css';
import '../styles/components/gl.css';
import '../styles/components/chrome.css';
import '../styles/components/button.css';
import '../styles/components/ticket.css';
import '../styles/components/countdown.css';
import '../styles/components/preloader.css';
import '../styles/sections/layout.css';
import '../styles/sections/hero.css';
import '../styles/sections/chapters.css';
import '../styles/sections/page.css';
import '../styles/sections/polish.css';
import '../styles/sections/hall.css';
import '../styles/sections/seating.css';
import '../styles/sections/section-head.css';

import { initHeader } from './header';
import { initScroll, lockScroll, scrollToTarget, ScrollTrigger } from './scroll';
import { initBooking } from './sections/booking';
import { initHall } from './sections/hall';
import { initSeating } from './sections/seating';
import { mountHero } from './sections/hero';
import { initReveals } from './sections/reveal';
import { runPreloader } from './sections/preloader';
import { renderSkeleton } from './sections/skeleton';

const html = document.documentElement;

renderSkeleton();
initHall();
initSeating();
initBooking();
const hero = mountHero();
initHeader();
initScroll();
initReveals();

// WebGL-слой (three.js) грузится лениво и не блокирует первый экран; снег включается вручную (fadeTo)
export const effects = import('./gl/index').then((m) => m.initEffects());

async function start(): Promise<void> {
  try {
    if (html.classList.contains('preloading')) {
      lockScroll(true);
      await runPreloader({
        ready: hero.ready,
        // Разлёт цифр: снежинки прелоадера становятся снегом сайта
        onBurst: () => void effects.then((e) => e.fadeTo(1, 2)),
      });
      lockScroll(false);
    } else {
      await hero.ready;
      void effects.then((e) => e.fadeTo(1, 1.6));
    }
  } finally {
    html.classList.remove('preloading', 'fx-intro');
  }
  await hero.play();
}
void start();

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
