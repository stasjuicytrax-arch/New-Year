import { gsap, reducedMotion, ScrollTrigger, SplitText } from '../scroll';

/**
 * Лёгкие scroll-анимации страницы (GSAP ScrollTrigger, без WebGL): заголовки по строкам, фото из маски с параллаксом,
 * номера глав и цены как счётчики, каскады, слова интро/манифеста по скроллу. Всё включается data-атрибутами из разметки.
 * При prefers-reduced-motion остаётся только статичное состояние. Вёрстку анимации не сдвигают (только transform/opacity/clip-path).
 */

const $$ = <T extends HTMLElement>(sel: string, root: ParentNode = document): T[] => [...root.querySelectorAll<T>(sel)];

const once = (el: Element, start = 'top 88%') => ({ trigger: el, start, once: true });

function fmtCount(el: HTMLElement, v: number): string {
  const dec = Number(el.dataset.dec ?? 0);
  const unit = el.dataset.unit ?? '';
  if (el.dataset.pad) return String(Math.round(v)).padStart(Number(el.dataset.pad), '0');
  if (el.dataset.sep) return new Intl.NumberFormat('ru-RU').format(Math.round(v)).replace(/\s/g, ' ');
  return v.toFixed(dec).replace('.', ',') + unit;
}

const CYR = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ';

function scramble(el: HTMLElement): void {
  const target = el.dataset.word ?? el.textContent ?? '';
  const proxy = { p: 0 };
  gsap.to(proxy, {
    p: 1,
    duration: 1.4,
    ease: 'power1.inOut',
    onUpdate: () => {
      const done = Math.floor(proxy.p * target.length * 1.15);
      el.textContent = [...target].map((ch, i) => (i < done ? ch : CYR[Math.floor(Math.random() * CYR.length)])).join('');
    },
    onComplete: () => { el.textContent = target; },
  });
}

export function initReveals(): void {
  if (reducedMotion.matches) return;

  // Заголовки: h3 по строкам из-под маски; хромовые h2 целиком (background-clip:text ломается на вложенных масках)
  $$('[data-split]').forEach((el) => {
    if (el.classList.contains('chrome')) {
      gsap.from(el, { y: 36, opacity: 0, filter: 'blur(8px)', duration: 0.9, ease: 'expo.out', scrollTrigger: once(el) });
      return;
    }
    SplitText.create(el, {
      type: 'lines',
      mask: 'lines',
      maskClass: 'split-mask',
      autoSplit: true,
      onSplit: (self) =>
        gsap.from(self.lines, { yPercent: 110, duration: 0.9, ease: 'expo.out', stagger: 0.08, scrollTrigger: once(el) }),
    });
  });

  $$('[data-fade]').forEach((el) => {
    gsap.from(el, { y: 24, opacity: 0, duration: 0.8, ease: 'expo.out', scrollTrigger: once(el, 'top 92%') });
  });

  $$('[data-cascade]').forEach((el) => {
    gsap.from(el.children, { y: 28, opacity: 0, duration: 0.7, ease: 'expo.out', stagger: 0.08, scrollTrigger: once(el, 'top 85%') });
  });

  // Счётчики: номера глав, цены, граммовка меню
  $$('[data-count]').forEach((el) => {
    const end = Number(el.dataset.count);
    const proxy = { v: 0 };
    el.textContent = fmtCount(el, 0);
    gsap.to(proxy, {
      v: end,
      duration: el.dataset.pad ? 0.7 : 1.2,
      ease: 'power2.out',
      onUpdate: () => { el.textContent = fmtCount(el, proxy.v); },
      scrollTrigger: once(el, 'top 90%'),
    });
  });

  // Фото выезжают из маски, внутри лёгкий параллакс по скроллу
  $$('[data-mask]').forEach((el) => {
    gsap.fromTo(
      el,
      { clipPath: 'inset(16% 10% 16% 10%)', opacity: 0.4 },
      { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1, duration: 1.1, ease: 'expo.out', scrollTrigger: once(el, 'top 88%') },
    );
    const img = el.querySelector('img');
    if (img) {
      gsap.fromTo(img, { yPercent: -5, scale: 1.08 }, { yPercent: 5, scale: 1.08, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
    }
  });

  // Кадр Снегурочки уходит быстрее кадра Деда Мороза: сдвиг по глубине
  const frameB = document.querySelector<HTMLElement>('.ch__frame--b');
  if (frameB) gsap.to(frameB, { yPercent: -10, ease: 'none', scrollTrigger: { trigger: frameB, start: 'top bottom', end: 'bottom top', scrub: true } });

  $$('[data-parallax]').forEach((el) => {
    const d = Number(el.dataset.parallax);
    gsap.fromTo(el, { yPercent: -d }, { yPercent: d, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  // Детские фото: стопка раскладывается веером
  $$('[data-fan]').forEach((fan) => {
    const [a, b, c] = $$('.ch__polaroid', fan);
    const st = { trigger: fan, start: 'top 85%', end: 'center 55%', scrub: 0.6 };
    gsap.fromTo(a, { rotate: 0, xPercent: 8, yPercent: 4 }, { rotate: -7, xPercent: -6, yPercent: 0, ease: 'none', scrollTrigger: st });
    gsap.fromTo(b, { rotate: 0, xPercent: -2 }, { rotate: 3, xPercent: 6, ease: 'none', scrollTrigger: st });
    gsap.fromTo(c, { rotate: 0, xPercent: -8, yPercent: -4 }, { rotate: -2, xPercent: -2, yPercent: 6, ease: 'none', scrollTrigger: st });
  });

  // Слово-образ: появление; ИЛЛЮЗИЯ перемешивает буквы; ФОТО даёт одну вспышку камеры (120 мс, не строб)
  $$('.ch__word-in').forEach((el) => {
    gsap.from(el, { scale: 0.94, opacity: 0, y: 40, duration: 1.1, ease: 'expo.out', scrollTrigger: once(el, 'top 90%') });
  });
  const ill = document.querySelector<HTMLElement>('.ch--illusion .ch__word-in');
  if (ill) ScrollTrigger.create({ trigger: ill, start: 'top 80%', once: true, onEnter: () => scramble(ill) });
  const flash = document.querySelector<HTMLElement>('.ch__flash');
  if (flash) {
    ScrollTrigger.create({
      trigger: '.ch--photo',
      start: 'top 55%',
      once: true,
      onEnter: () => void gsap.fromTo(flash, { opacity: 0 }, { opacity: 0.85, duration: 0.06, yoyo: true, repeat: 1, ease: 'none' }),
    });
  }

  // Фотоплёнка (глава 05): лента поляроидов едет по скроллу
  $$('[data-film]').forEach((film) => {
    const track = film.querySelector<HTMLElement>('.film__track');
    if (!track) return;
    gsap.fromTo(
      track,
      { x: 0 },
      { x: () => -Math.max(0, track.scrollWidth - film.clientWidth), ease: 'none', scrollTrigger: { trigger: film, start: 'top 90%', end: 'bottom 20%', scrub: 0.6, invalidateOnRefresh: true } },
    );
    gsap.from($$('.film__item', film), { y: 40, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08, scrollTrigger: once(film, 'top 85%') });
  });

  // Слова интро проявляются по мере скролла
  $$('[data-words]').forEach((el) => {
    SplitText.create(el, {
      type: 'words',
      autoSplit: true,
      onSplit: (self) =>
        gsap.fromTo(self.words, { opacity: 0.35 }, { opacity: 1, ease: 'none', stagger: 0.12, scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 48%', scrub: true } }),
    });
  });

  // Манифест: ключевые слова по очереди загораются хромом
  $$('.hl').forEach((el) => {
    ScrollTrigger.create({
      trigger: el,
      start: 'top 72%',
      onEnter: () => el.classList.add('is-lit'),
      onLeaveBack: () => el.classList.remove('is-lit'),
    });
  });
}
