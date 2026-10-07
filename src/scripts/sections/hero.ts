import { event, hero, typo } from '../../content/content';
import { chromeText, type ChromeText } from '../chrome';
import { mountCountdown } from '../countdown';
import { finePointer, gsap, reducedMotion, ScrollTrigger } from '../scroll';
import { magnetic, ticketFrame } from '../ui';

import snowflakeSvg from '../../assets/deco/snowflake.svg?raw';
import hostsAvif1400 from '../../assets/img/hosts-cutout-1400.avif';
import hostsAvif900 from '../../assets/img/hosts-cutout-900.avif';
import hostsWebp1400 from '../../assets/img/hosts-cutout-1400.webp';
import hostsWebp900 from '../../assets/img/hosts-cutout-900.webp';
import hostsPng900 from '../../assets/img/hosts-cutout-900.png';
import fir1 from '../../assets/deco/fir-1.webp';
import fir2 from '../../assets/deco/fir-2.webp';
import baubleGraphiteL from '../../assets/deco/bauble-graphite-l.webp';
import baubleSilverL from '../../assets/deco/bauble-silver-l.webp';
import baubleBlueL from '../../assets/deco/bauble-blue-l.webp';

/**
 * HERO: сцена в четырёх слоях глубины (TZ §5.1).
 * дальний: подложка body::before и боке WebGL | свет: три луча | средний: ведущие | передний: ветки и шары.
 * Порядок по Z: луч 0, строка «НОВОГОДНЯЯ» 1, ведущие 2, остальной текст 3, декор 4, нижний ряд 5.
 */
export interface Hero {
  /** Шрифты и фигура ведущих готовы: можно убирать прелоадер. */
  ready: Promise<void>;
  /** Запустить вход (≤ 2.5 с) и подключить скролл-сцену. */
  play(): Promise<void>;
}

const glyph = (cls = ''): string => `<span class="glyph ${cls}" aria-hidden="true">${snowflakeSvg}</span>`;

// Три шара, а не пять: меньше «чёрных дыр» у шапки и меньше слоёв для компоновки
const BAUBLES = [
  { cls: 'b1', src: baubleSilverL, w: 104, drop: 0.5, delay: '-1.2s', dur: '6.2s' },
  { cls: 'b3', src: baubleGraphiteL, w: 96, drop: 0.55, delay: '-0.4s', dur: '6.8s' },
  { cls: 'b5', src: baubleBlueL, w: 78, drop: 0.3, delay: '-4.4s', dur: '5.6s' },
] as const;

function markup(): string {
  const [t1, t2, t3] = hero.titleLines;
  const [dateT, timeT] = hero.tickets;
  return `
  <div class="hero__stage" data-stage>
    <div class="hero__beams" aria-hidden="true">
      <div class="beam beam--l"><i></i></div>
      <div class="beam beam--r"><i></i></div>
      <div class="beam beam--c"><i></i></div>
    </div>
    <div class="hero__corridor" aria-hidden="true"></div>
    <div class="hero__flash" aria-hidden="true"></div>

    <div class="hero__inner container">
      <p class="label label-lines hero__label" data-label><span>${hero.label}</span></p>
      <h1 id="hero-title" class="hero__title" data-title>
        <span class="hero__line hero__line--1" data-line>${t1}</span>
        <span class="hero__line hero__line--2" data-line>${t2}</span>
        <span class="hero__line hero__line--3" data-line>${t3}</span>
      </h1>
    </div>

    <picture class="hero__hosts" data-hosts>
      <source type="image/avif" srcset="${hostsAvif900} 926w, ${hostsAvif1400} 1441w" sizes="(min-width: 768px) 60vw, 92vw">
      <source type="image/webp" srcset="${hostsWebp900} 926w, ${hostsWebp1400} 1441w" sizes="(min-width: 768px) 60vw, 92vw">
      <img src="${hostsPng900}" width="926" height="900" alt="${event.hosts.join(' и ')}, ведущие Главной новогодней ночи" fetchpriority="high" decoding="async">
    </picture>

    <div class="hero__decor" aria-hidden="true" data-decor>
      <img class="fir fir--l" src="${fir1}" alt="" width="1200" height="720" decoding="async">
      <img class="fir fir--r" src="${fir2}" alt="" width="1200" height="720" decoding="async">
      ${BAUBLES.map(
        (b) => `<div class="bauble ${b.cls}" style="--w:${b.w}px;--drop:${b.drop};--delay:${b.delay};--dur:${b.dur}"><img src="${b.src}" alt="" width="360" height="520" decoding="async"></div>`,
      ).join('')}
    </div>

    <div class="hero__bottom container">
      <div class="hero__col hero__col--l">
        <p class="hero__sub" data-in>${typo(hero.subtitle)}</p>
        <div class="hero__tickets">
          <div class="ticket ticket--date" data-ticket>
            <span class="ticket__value">${dateT.value}</span>
          </div>
          ${glyph('hero__flake')}
          <div class="ticket ticket--time" data-ticket>
            <span class="label">${timeT.label}</span>
            <span class="ticket__value">${timeT.value}</span>
          </div>
        </div>
        <div class="hero__cta" data-in>
          <span class="btn-wrap" data-magnetic>
            <a class="btn btn--primary" href="#booking" data-goal="book_click"><span>${hero.cta}</span></a>
          </span>
          <p class="hero__price">${hero.priceNote}</p>
          <p class="label hero__note">${hero.ctaNote}</p>
        </div>
      </div>
      <div class="hero__col hero__col--r">
        <p class="label hero__names" data-in>${hero.hostsLine}</p>
        <p class="hero__kids" data-in>${hero.kidsBadge}</p>
        <div class="hero__count" data-in></div>
      </div>
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

  const stage = $('[data-stage]');
  const hosts = $('[data-hosts]');
  const decor = $('[data-decor]');
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
  const frames = tickets.map((t) => ticketFrame(t));
  $$('[data-magnetic]').forEach((w) => magnetic(w, 8));
  mountCountdown($('.hero__count'), hero.countdownLabel, 'compact');

  const ready = Promise.all([
    document.fonts.load('700 64px "Cormorant SC"', 'НОВОГОДНЯЯ 2027'),
    document.fonts.load('400 16px Onest', 'Забронировать'),
    document.fonts.load('600 16px Onest', 'Забронировать'),
    img.decode().catch(() => undefined),
  ]).then(() => undefined);

  // Начальные состояния входа. Класс fx-intro (inline-скрипт в head) прячет сцену до этого момента.
  const initIntro = (): void => {
    lines.forEach((l) => gsap.set(l.chars, { yPercent: 115 }));
    gsap.set(beamEls, { opacity: 0 });
    gsap.set(hosts, { '--r': 0, filter: 'brightness(0.45)' });
    gsap.set(label, { '--ls': 0, opacity: 0 });
    gsap.set(frames.map((f) => f.stroke), { strokeDashoffset: 1 });
    gsap.set(frames.map((f) => f.fill), { opacity: 0 });
    gsap.set(tickets.map((t) => [...t.children].filter((c) => !(c instanceof SVGElement))).flat(), { opacity: 0, y: 10 });
    gsap.set('.hero__flake', { opacity: 0, rotate: -60, scale: 0.6 });
    gsap.set(fade, { opacity: 0, y: 24, filter: 'blur(8px)' });
    gsap.set('.fir--l', { xPercent: -14, opacity: 0 });
    gsap.set('.fir--r', { xPercent: 14, opacity: 0 });
    gsap.set('.bauble', { yPercent: -140 });
    if (header) {
      gsap.set(header, { opacity: 0 });
      // Страховка: если вход не доиграл, шапка с кнопкой брони не должна остаться невидимой
      gsap.delayedCall(6, () => { gsap.set(header, { opacity: 1 }); });
    }
  };
  if (animated) initIntro();
  // fx-intro снимает main.ts, когда готовы шрифты и фигура (иначе сдвиг макета при подмене шрифтов)

  /** Блик следует за курсором, слои уходят в параллакс (только fine pointer). */
  const pointerLife = (): void => {
    if (!finePointer.matches) return;
    const qh = [gsap.quickTo(hosts, 'x', { duration: 0.9, ease: 'power3.out' }), gsap.quickTo(hosts, 'y', { duration: 0.9, ease: 'power3.out' })];
    const qd = [gsap.quickTo(decor, 'x', { duration: 1.1, ease: 'power3.out' }), gsap.quickTo(decor, 'y', { duration: 1.1, ease: 'power3.out' })];
    const qb = [gsap.quickTo(beams, 'x', { duration: 1.4, ease: 'power3.out' }), gsap.quickTo(beams, 'y', { duration: 1.4, ease: 'power3.out' })];
    let target = window.innerWidth * 0.5, current = target;
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        const nx = (e.clientX / window.innerWidth - 0.5) * 2;
        const ny = (e.clientY / window.innerHeight - 0.5) * 2;
        qh[0](nx * -12); qh[1](ny * -6);
        qd[0](nx * 26); qd[1](ny * 14);
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

  /** Скролл-сцена: «камера влетает в зал». Pinned ~150vh на desktop, лёгкий выход на mobile. */
  const scrollScene = (): void => {
    const mm = gsap.matchMedia();
    mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        // ~100vh вместо 150: гость быстрее доходит до брони
        scrollTrigger: { trigger: root, start: 'top top', end: '+=100%', scrub: 0.8, pin: stage, anticipatePin: 1, invalidateOnRefresh: true },
      });
      // Масштабируем строки, а не h1: transform на h1 создал бы stacking context и сломал слои «за ведущими»
      gsap.set('.hero__corridor', { scaleX: 0.15 });
      tl.to(lineEls, { scale: 1.9, transformOrigin: '50% 50%' }, 0)
        .to(lineEls[0], { xPercent: -16, yPercent: -70 }, 0)
        .to(lineEls[1], { yPercent: -10 }, 0)
        .to(lineEls[2], { xPercent: 16, yPercent: 80 }, 0)
        .to(lineEls, { opacity: 0, duration: 0.35 }, 0.4)
        .to(hosts, { yPercent: 26, scale: 1.1, transformOrigin: '50% 100%' }, 0)
        .to(hosts, { opacity: 0, duration: 0.35 }, 0.5)
        .to('.hero__bottom', { opacity: 0, y: 70, duration: 0.3 }, 0)
        .to(label, { opacity: 0, duration: 0.2 }, 0)
        .to(decor, { yPercent: -45, duration: 1 }, 0)
        // лучи разворачиваются в вертикальный коридор (CSS rotate -34/34deg + rotation из GSAP)
        .to('.beam--l', { rotation: 34 }, 0)
        .to('.beam--r', { rotation: -34 }, 0)
        .to('.hero__corridor', { opacity: 0.6, scaleX: 1, duration: 0.45 }, 0.5);
    });
    mm.add('(max-width: 767px) and (prefers-reduced-motion: no-preference)', () => {
      gsap.to([...lineEls, hosts], {
        yPercent: -6,
        opacity: 0.2,
        ease: 'none',
        scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: true },
      });
    });
  };

  const settle = (): void => {
    lines.forEach((l) => l.measure());
    // Служебные inline-стили входа больше не нужны
    gsap.set(hosts, { clearProps: 'filter' });
    gsap.set(fade, { clearProps: 'filter' });
    // will-change нужен только на время входа: на ~30 слоях в покое он съедает память на mobile
    root.classList.add('is-settled');
    pointerLife();
    scrollScene();
    ScrollTrigger.refresh();
  };

  const play = async (): Promise<void> => {
    if (!animated) {
      lines.forEach((l) => l.rest());
      scrollScene();
      return;
    }
    const W = window.innerWidth;
    await new Promise<void>((resolve) => {
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: () => { settle(); resolve(); } });

      // 1. Лучи включаются по очереди одним мягким нарастанием (без мерцания: лимит стробо 3 Гц) и одна мягкая вспышка
      beamEls.forEach((b, i) => {
        tl.to(b, { opacity: 1, duration: 0.55, ease: 'power2.out' }, i * 0.18);
      });
      tl.fromTo('.hero__flash', { opacity: 0 }, { opacity: 0.22, duration: 0.14, yoyo: true, repeat: 1, ease: 'power1.out' }, 0.02)
        // 2. H1 выезжает по буквам из-под маски
        .to(label, { opacity: 1, duration: 0.5 }, 0.15)
        .to(label, { '--ls': 1, duration: 0.9 }, 0.15);
      lines.forEach((l, i) => {
        tl.to(l.chars, { yPercent: 0, duration: 0.85, stagger: 0.032 }, 0.2 + i * 0.14);
      });
      // блик проезжает по хрому один раз
      tl.add(() => lines.forEach((l) => { l.measure(); l.sweep(-260, W + 260, 1.15); }), 0.95)
        // 3. Ведущие проявляются из темноты: свет снизу вверх
        .to(hosts, { '--r': 1, duration: 1.15, ease: 'power2.out' }, 0.6)
        .to(hosts, { filter: 'brightness(1)', duration: 1.1, ease: 'power1.out' }, 0.6)
        // декор: ветки въезжают, шары спускаются на нитях
        .to('.fir', { xPercent: 0, opacity: 1, duration: 1.2, stagger: 0.1 }, 0.35)
        .to('.bauble', { yPercent: 0, duration: 1.3, stagger: 0.09, ease: 'power3.out' }, 0.55)
        // 4. Билеты собираются из линий
        .to(frames.map((f) => f.stroke), { strokeDashoffset: 0, duration: 0.8, stagger: 0.12, ease: 'power2.inOut' }, 1.0)
        .to(frames.map((f) => f.fill), { opacity: 1, duration: 0.5, stagger: 0.12 }, 1.35)
        .to(tickets.map((t) => [...t.children].filter((c) => !(c instanceof SVGElement))).flat(), { opacity: 1, y: 0, duration: 0.6, stagger: 0.12 }, 1.3)
        .to('.hero__flake', { opacity: 1, rotate: 0, scale: 1, duration: 0.7 }, 1.35)
        // 5. Подзаголовок, CTA, ведущие, счётчик
        .to(fade, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7, stagger: 0.09 }, 1.2);
      if (header) tl.to(header, { opacity: 1, duration: 0.6 }, 1.6);
    });
  };

  return { ready, play };
}

