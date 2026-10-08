import { footer, hall as t } from '../../content/content';
import { lockScroll } from '../scroll';
import { picture } from '../media';

/**
 * Секция «Зал WHITE HALL» (#hall) перед выбором мест: галерея из папки «White hall» (5 отобранных кадров).
 * Десктоп: бенто-сетка (одно большое фото на 2 ряда слева + 4 поменьше 2×2), вся целиком в одном экране.
 * Телефон: горизонтальная лента со scroll-snap, виден край следующего фото, точки-индикатор.
 * Клик/тап: лайтбокс на весь экран (стрелки, свайп, Esc, ×, свайп вниз закрывает).
 */

interface Shot {
  name: string;
  alt: string;
}

const SHOTS: readonly Shot[] = [
  { name: 'hall-1', alt: 'Зал WHITE HALL с проекцией снежинок на окнах' },
  { name: 'hall-2', alt: 'Зал WHITE HALL в розовой подсветке, на экранах «С Новым годом!»' },
  { name: 'hall-3', alt: 'Зал WHITE HALL: белое оформление и потолочные драпировки' },
  { name: 'hall-4', alt: 'Зал WHITE HALL с живой зелёной стеной' },
  { name: 'hall-5', alt: 'Зал WHITE HALL: панорамные окна и деревья в кадках' },
];

const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5L8 12l6.5 6.5"/></svg>';
const ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5"/></svg>';

export function renderHall(): string {
  const n = SHOTS.length;
  const items = SHOTS.map(
    (s, i) =>
      `<button type="button" class="hall__item hall__item--${i + 1}" data-i="${i}" aria-label="${s.alt}. ${t.open} ${i + 1} ${t.of} ${n}">${picture({
        name: s.name,
        alt: '',
        sizes: i === 0 ? '(min-width: 1024px) 46vw, 82vw' : '(min-width: 1024px) 26vw, 82vw',
        cls: 'hall__img',
        eager: i === 0,
      })}</button>`,
  ).join('');
  return `
  <div class="container hall">
    <header class="hall__head">
      <h2 id="hall-title" class="chrome" data-split>${t.title}</h2>
      <p class="hall__cap">${footer.venueLine}</p>
    </header>
    <div class="hall__rail" data-rail>
      <div class="hall__grid" data-cascade>${items}</div>
    </div>
    <div class="hall__dots" aria-hidden="true">${SHOTS.map((_, i) => `<span class="${i === 0 ? 'is-on' : ''}"></span>`).join('')}</div>
  </div>
  <dialog class="lightbox" id="hall-lightbox" aria-label="${t.lightbox}">
    <div class="lightbox__stage" data-stage></div>
    <button type="button" class="lightbox__btn lightbox__close" data-lb-close aria-label="${t.close}">${ICON_CLOSE}</button>
    <button type="button" class="lightbox__btn lightbox__prev" data-lb-prev aria-label="${t.prev}">${ICON_PREV}</button>
    <button type="button" class="lightbox__btn lightbox__next" data-lb-next aria-label="${t.next}">${ICON_NEXT}</button>
    <p class="lightbox__count" data-lb-count aria-live="polite"></p>
  </dialog>`;
}

export function initHall(): void {
  const root = document.querySelector<HTMLElement>('#hall');
  if (!root) return;
  const rail = root.querySelector<HTMLElement>('[data-rail]')!;
  const items = [...root.querySelectorAll<HTMLButtonElement>('.hall__item')];
  const dots = [...root.querySelectorAll<HTMLElement>('.hall__dots span')];
  const dlg = root.querySelector<HTMLDialogElement>('#hall-lightbox')!;
  const stage = dlg.querySelector<HTMLElement>('[data-stage]')!;
  const count = dlg.querySelector<HTMLElement>('[data-lb-count]')!;
  const n = SHOTS.length;
  let cur = 0;
  let opener: HTMLElement | null = null;

  // Точки-индикатор ленты (телефон): ближайший к левому краю кадр
  const syncDots = (): void => {
    const step = items.length > 1 ? items[1].offsetLeft - items[0].offsetLeft : rail.clientWidth;
    const idx = Math.max(0, Math.min(n - 1, Math.round(rail.scrollLeft / Math.max(step, 1))));
    dots.forEach((d, i) => d.classList.toggle('is-on', i === idx));
  };
  rail.addEventListener('scroll', syncDots, { passive: true });

  // Лайтбокс
  const show = (i: number): void => {
    cur = (i + n) % n;
    const s = SHOTS[cur];
    stage.innerHTML = picture({ name: s.name, alt: s.alt, sizes: '100vw', cls: 'lightbox__img', eager: true });
    count.textContent = `${cur + 1} / ${n}`;
  };
  const open = (i: number, from: HTMLElement): void => {
    opener = from;
    show(i);
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    lockScroll(true);
  };
  const close = (): void => {
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  };
  dlg.addEventListener('close', () => {
    lockScroll(false);
    opener?.focus({ preventScroll: true });
  });

  items.forEach((b) => b.addEventListener('click', () => open(Number(b.dataset.i), b)));
  dlg.querySelector('[data-lb-close]')!.addEventListener('click', close);
  dlg.querySelector('[data-lb-prev]')!.addEventListener('click', () => show(cur - 1));
  dlg.querySelector('[data-lb-next]')!.addEventListener('click', () => show(cur + 1));
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      show(cur - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      show(cur + 1);
    }
  });
  // клик по тёмному полю вокруг фото закрывает
  dlg.addEventListener('click', (e) => {
    const target = e.target as Element;
    if (target === dlg || target === stage) close();
  });

  // Свайп: влево/вправо листает, вниз закрывает
  let down: { x: number; y: number; id: number } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* синтетическое событие без активного указателя */
    }
  });
  stage.addEventListener('pointerup', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) show(cur + (dx < 0 ? 1 : -1));
    else if (dy > 80 && dy > Math.abs(dx)) close();
  });
  stage.addEventListener('pointercancel', () => {
    down = null;
  });
}
