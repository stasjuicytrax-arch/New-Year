import { event, hero, typo } from '../../content/content';
import { chromeText, type ChromeText } from '../chrome';
import { mountCountdown } from '../countdown';
import { finePointer, gsap, reducedMotion } from '../scroll';
import { magnetic } from '../ui';

import hostsAvif640 from '../../assets/img/hosts-cutout-640.avif';
import hostsAvif960 from '../../assets/img/hosts-cutout-960.avif';
import hostsAvif1440 from '../../assets/img/hosts-cutout-1440.avif';
import hostsAvif1861 from '../../assets/img/hosts-cutout-1861.avif';
import hostsWebp640 from '../../assets/img/hosts-cutout-640.webp';
import hostsWebp960 from '../../assets/img/hosts-cutout-960.webp';
import hostsWebp1440 from '../../assets/img/hosts-cutout-1440.webp';
import hostsWebp1861 from '../../assets/img/hosts-cutout-1861.webp';

/**
 * HERO-афиша, ВЕРСИЯ 2: центрированная композиция (docs/DESIGN-SYSTEM.md).
 * Метка и H1 по центру → ведущие крупно (головы перекрывают низ «НОЧЬ 2027») → билеты и кнопка → крупный таймер → цена.
 * Всё в обычном потоке: уходит вместе с hero, ничего не «висит» под шапкой.
 */
export interface Hero {
  /** Шрифты и фигура ведущих готовы: можно убирать прелоадер. */
  ready: Promise<void>;
  /** Запустить вход (≤ 2.5 с). */
  play(): Promise<void>;
}

const SIZES = '(min-width: 1024px) 34vw, min(100vw, 480px)';

function markup(): string {
  const [t1, t2, t3] = hero.titleLines;
  const [dateT, timeT] = hero.tickets;
  return `
  <div class="hero__stage" data-stage>
    <div class="hero__beams" aria-hidden="true">
      <div class="beam beam--l"><i></i></div>
      <div class="beam beam--r"><i></i></div>
    </div>
    <div class="hero__glow" aria-hidden="true"></div>
    <div class="hero__flash" aria-hidden="true"></div>

    <div class="hero__head">
      <p class="label label--dot hero__label" data-label>${hero.label}</p>
      <h1 id="hero-title" class="hero__title" data-title aria-label="Главная новогодняя ночь 2027">
        <span class="hero__line hero__line--1" data-line>${t1}</span>
        <span class="hero__line hero__line--2" data-line>${t2}</span>
        <span class="hero__line hero__line--3" data-line>${t3}</span>
      </h1>
    </div>

    <div class="hero__figure">
      <picture class="hero__hosts" data-hosts>
        <source type="image/avif" srcset="${hostsAvif640} 640w, ${hostsAvif960} 960w, ${hostsAvif1440} 1440w, ${hostsAvif1861} 1861w" sizes="${SIZES}">
        <source type="image/webp" srcset="${hostsWebp640} 640w, ${hostsWebp960} 960w, ${hostsWebp1440} 1440w, ${hostsWebp1861} 1861w" sizes="${SIZES}">
        <img src="${hostsWebp960}" srcset="${hostsWebp640} 640w, ${hostsWebp960} 960w, ${hostsWebp1440} 1440w, ${hostsWebp1861} 1861w" sizes="${SIZES}" width="1861" height="2698" alt="${event.hosts.join(' и ')}, ведущие Главной новогодней ночи" fetchpriority="high" decoding="async">
      </picture>
    </div>

    <div class="hero__info">
      <p class="label hero__names" data-in>${hero.hostsLine}</p>
      <div class="hero__row">
        <div class="hero__tickets">
          <div class="ticket ticket--date" data-ticket>
            <span class="ticket__value">${dateT.value}</span>
          </div>
          <span class="hero__sep" aria-hidden="true"></span>
          <div class="ticket ticket--time" data-ticket>
            <span class="label">${timeT.label}</span>
            <span class="ticket__value">${timeT.value}</span>
          </div>
        </div>
        <div class="hero__cta" data-in>
          <span class="btn-wrap" data-magnetic>
            <a class="btn btn--primary" href="#seats" data-goal="book_click"><span>${hero.cta}</span></a>
          </span>
        </div>
      </div>
      <div class="hero__timer" data-in></div>
      <p class="hero__price" data-in>${hero.priceNote}</p>
      <p class="hero__sub" data-in>${typo(hero.subtitle)}</p>
    </div>
  </div>`;
}

export function mountHero(): Hero {
  const root = document.querySelector<HTMLElement>('#hero')!;
  root.classList.remove('scene');
  root.classList.add('hero');
  root.innerHTML = markup();

  const $ = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;
  const $$ = <T extends HTMLElement>(sel: string): T[] => [...root.querySelectorAll<T>(sel)];

  const hosts = $('[data-hosts]');
  const beams = $('.hero__beams');
  const beamEls = $$('.beam');
  const label = $('[data-label]');
  const lineEls = $$('[data-line]');
  const tickets = $$('[data-ticket]');
  const fade = $$('[data-in]');
  const img = hosts.querySelector('img')!;
  const header = document.querySelector<HTMLElement>('#site-header');

  // Хромированные буквы; маска включается, когда есть анимация входа
  const animated = !reducedMotion.matches;
  const lines: ChromeText[] = lineEls.map((el) => chromeText(el, { mask: animated }));
  $$('[data-magnetic]').forEach((w) => magnetic(w, 8));
  mountCountdown($('.hero__timer'), hero.countdownLabel, 'poster');

  const ready = Promise.all([
    document.fonts.load('400 64px Prata', 'НОВОГОДНЯЯ 2027'),
    document.fonts.load('400 16px Manrope', 'Забронировать'),
    document.fonts.load('600 16px Manrope', 'Забронировать'),
    img.decode().catch(() => undefined),
  ]).then(() => undefined);

  // Начальные состояния входа. Класс fx-intro (inline-скрипт в head) прячет сцену до этого момента.
  const initIntro = (): void => {
    lines.forEach((l) => gsap.set(l.chars, { yPercent: 115 }));
    gsap.set(beamEls, { opacity: 0 });
    gsap.set(hosts, { '--r': 0, filter: 'brightness(0.45)' });
    gsap.set(label, { opacity: 0 });
    gsap.set(tickets, { opacity: 0, y: 16, scale: 0.96 });
    gsap.set('.hero__sep', { opacity: 0, scaleY: 0 });
    gsap.set(fade, { opacity: 0, y: 24, filter: 'blur(8px)' });
    if (header) {
      gsap.set(header, { opacity: 0 });
      // Страховка: если вход не доиграл, шапка с телефоном не должна остаться невидимой
      gsap.delayedCall(6, () => { gsap.set(header, { opacity: 1 }); });
    }
  };
  if (animated) initIntro();
  // fx-intro снимает main.ts, когда готовы шрифты и фигура (иначе сдвиг макета при подмене шрифтов)

  /** Блик следует за курсором, фигура и лучи слегка смещаются (только fine pointer). */
  const pointerLife = (): void => {
    if (!finePointer.matches) return;
    const qh = [gsap.quickTo(hosts, 'x', { duration: 0.9, ease: 'power3.out' }), gsap.quickTo(hosts, 'y', { duration: 0.9, ease: 'power3.out' })];
    const qb = [gsap.quickTo(beams, 'x', { duration: 1.4, ease: 'power3.out' }), gsap.quickTo(beams, 'y', { duration: 1.4, ease: 'power3.out' })];
    let target = window.innerWidth * 0.5, current = target;
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        const nx = (e.clientX / window.innerWidth - 0.5) * 2;
        const ny = (e.clientY / window.innerHeight - 0.5) * 2;
        qh[0](nx * -10); qh[1](ny * -5);
        qb[0](nx * -6); qb[1](ny * -3);
        target = e.clientX;
      },
      { passive: true },
    );
    gsap.ticker.add(() => {
      if (Math.abs(target - current) < 0.4) return;
      current += (target - current) * 0.12;
      lines.forEach((l) => l.setSheen(current));
    });
  };

  /** Медленный блик по хрому раз в ~7 секунд, только пока hero в кадре. */
  const periodicSheen = (): void => {
    let visible = true;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(root);
    const run = (): void => {
      if (visible && !document.hidden) lines.forEach((l) => { l.measure(); l.sweep(-300, window.innerWidth + 300, 1.9); });
      gsap.delayedCall(7, run);
    };
    gsap.delayedCall(5, run);
  };

  const settle = (): void => {
    lines.forEach((l) => l.measure());
    gsap.set(hosts, { clearProps: 'filter' });
    gsap.set(fade, { clearProps: 'filter' });
    root.classList.add('is-settled');
    pointerLife();
    periodicSheen();
  };

  const play = async (): Promise<void> => {
    if (!animated) {
      lines.forEach((l) => l.rest());
      return;
    }
    const W = window.innerWidth;
    await new Promise<void>((resolve) => {
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: () => { settle(); resolve(); } });

      // 1. Лучи включаются по очереди мягким нарастанием (лимит стробо 3 Гц) и одна мягкая вспышка
      beamEls.forEach((b, i) => {
        tl.to(b, { opacity: 1, duration: 0.55, ease: 'power2.out' }, i * 0.18);
      });
      tl.fromTo('.hero__flash', { opacity: 0 }, { opacity: 0.22, duration: 0.14, yoyo: true, repeat: 1, ease: 'power1.out' }, 0.02)
        // 2. H1 выезжает по буквам из-под маски
        .to(label, { opacity: 1, duration: 0.5 }, 0.15);
      lines.forEach((l, i) => {
        tl.to(l.chars, { yPercent: 0, duration: 0.85, stagger: 0.032 }, 0.2 + i * 0.14);
      });
      // блик проезжает по хрому один раз
      tl.add(() => lines.forEach((l) => { l.measure(); l.sweep(-260, W + 260, 1.3); }), 0.95)
        // 3. Ведущие проявляются из темноты: свет снизу вверх
        .to(hosts, { '--r': 1, duration: 1.15, ease: 'power2.out' }, 0.5)
        .to(hosts, { filter: 'brightness(1)', duration: 1.1, ease: 'power1.out' }, 0.5)
        // 4. Плашки даты и времени
        .to(tickets, { opacity: 1, y: 0, scale: 1, duration: 0.7, stagger: 0.12 }, 1.1)
        .to('.hero__sep', { opacity: 1, scaleY: 1, duration: 0.7 }, 1.25)
        // 5. Имена, кнопка, таймер, цена, подзаголовок
        .to(fade, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7, stagger: 0.09 }, 1.2);
      if (header) tl.to(header, { opacity: 1, duration: 0.6 }, 1.6);
    });
  };

  return { ready, play };
}
