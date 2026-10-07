import { event, hero, typo } from '../../content/content';
import { chromeText, type ChromeText } from '../chrome';
import { mountCountdown } from '../countdown';
import { finePointer, gsap, reducedMotion } from '../scroll';
import { magnetic, ticketFrame } from '../ui';

import snowflakeSvg from '../../assets/deco/snowflake.svg?raw';
import hostsAvif1024 from '../../assets/img/hosts-cutout-1024.avif';
import hostsAvif600 from '../../assets/img/hosts-cutout-600.avif';
import hostsWebp1024 from '../../assets/img/hosts-cutout-1024.webp';
import hostsWebp600 from '../../assets/img/hosts-cutout-600.webp';
import hostsPng600 from '../../assets/img/hosts-cutout-600.png';

/**
 * HERO-афиша (заменяет TZ §5.1). Desktop ≥1024: сплит 40/60, слева колонка текста, справа ведущие крупно.
 * Mobile: H1 → ведущие → строка про ТОП-150 → билеты → кнопка → цена. Слои по Z: свет 0, ведущие 2, текст 3.
 * Счётчик вынесен в узкую полосу под hero (#countdown).
 */
export interface Hero {
  /** Шрифты и фигура ведущих готовы: можно убирать прелоадер. */
  ready: Promise<void>;
  /** Запустить вход (≤ 2.5 с). */
  play(): Promise<void>;
}

const glyph = (cls = ''): string => `<span class="glyph ${cls}" aria-hidden="true">${snowflakeSvg}</span>`;

const SIZES = '(min-width: 1024px) 56vw, min(100vw, 500px)';

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
      <p class="label hero__label" data-label>${hero.label}</p>
      <h1 id="hero-title" class="hero__title" data-title aria-label="Главная новогодняя ночь 2027">
        <span class="hero__line hero__line--1" data-line>${t1}</span>
        <span class="hero__line hero__line--2" data-line>${t2}</span>
        <span class="hero__line hero__line--3" data-line>${t3}</span>
      </h1>
    </div>

    <div class="hero__figure">
      <picture class="hero__hosts" data-hosts>
        <source type="image/avif" srcset="${hostsAvif600} 600w, ${hostsAvif1024} 1024w" sizes="${SIZES}">
        <source type="image/webp" srcset="${hostsWebp600} 600w, ${hostsWebp1024} 1024w" sizes="${SIZES}">
        <img src="${hostsPng600}" width="1024" height="1536" alt="${event.hosts.join(' и ')}, ведущие Главной новогодней ночи" fetchpriority="high" decoding="async">
      </picture>
      <p class="label hero__names" data-in>${hero.hostsLine}</p>
    </div>

    <div class="hero__info">
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
        <p class="hero__price">${hero.priceNote} <span class="hero__note">${hero.ctaNote}</span></p>
      </div>
    </div>

    <div class="hero__timer" data-in></div>
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
  const frames = tickets.map((t) => ticketFrame(t));
  $$('[data-magnetic]').forEach((w) => magnetic(w, 8));
  mountCountdown($('.hero__timer'), hero.countdownLabel, 'mini');

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
    gsap.set(label, { opacity: 0 });
    gsap.set(frames.map((f) => f.stroke), { strokeDashoffset: 1 });
    gsap.set(frames.map((f) => f.fill), { opacity: 0 });
    gsap.set(tickets.map((t) => [...t.children].filter((c) => !(c instanceof SVGElement))).flat(), { opacity: 0, y: 10 });
    gsap.set('.hero__flake', { opacity: 0, rotate: -60, scale: 0.6 });
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
    let target = window.innerWidth * 0.3, current = target;
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        const nx = (e.clientX / window.innerWidth - 0.5) * 2;
        const ny = (e.clientY / window.innerHeight - 0.5) * 2;
        qh[0](nx * -12); qh[1](ny * -6);
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

  /** Скролл: фигура уходит чуть медленнее текста. Только desktop; на телефоне вёрстку ничто не двигает. */
  const scrollScene = (): void => {
    const mm = gsap.matchMedia();
    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      gsap.to(hosts, {
        yPercent: 5,
        ease: 'none',
        scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: true },
      });
    });
  };

  const settle = (): void => {
    lines.forEach((l) => l.measure());
    gsap.set(hosts, { clearProps: 'filter' });
    gsap.set(fade, { clearProps: 'filter' });
    root.classList.add('is-settled');
    pointerLife();
    scrollScene();
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
      tl.add(() => lines.forEach((l) => { l.measure(); l.sweep(-260, W * 0.6 + 260, 1.15); }), 0.95)
        // 3. Ведущие проявляются из темноты: свет снизу вверх
        .to(hosts, { '--r': 1, duration: 1.15, ease: 'power2.out' }, 0.5)
        .to(hosts, { filter: 'brightness(1)', duration: 1.1, ease: 'power1.out' }, 0.5)
        // 4. Билеты собираются из линий
        .to(frames.map((f) => f.stroke), { strokeDashoffset: 0, duration: 0.8, stagger: 0.12, ease: 'power2.inOut' }, 1.0)
        .to(frames.map((f) => f.fill), { opacity: 1, duration: 0.5, stagger: 0.12 }, 1.35)
        .to(tickets.map((t) => [...t.children].filter((c) => !(c instanceof SVGElement))).flat(), { opacity: 1, y: 0, duration: 0.6, stagger: 0.12 }, 1.3)
        .to('.hero__flake', { opacity: 1, rotate: 0, scale: 1, duration: 0.7 }, 1.35)
        // 5. Подзаголовок, CTA, подпись ведущих
        .to(fade, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7, stagger: 0.09 }, 1.2);
      if (header) tl.to(header, { opacity: 1, duration: 0.6 }, 1.6);
    });
  };

  return { ready, play };
}
