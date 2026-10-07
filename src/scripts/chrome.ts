import { gsap, SplitText } from './scroll';

/**
 * Хромированный display-текст с живым бликом (DESIGN-SYSTEM §7.1).
 * Делит текст на буквы (в маске, чтобы буквы выезжали из-под линии) и ведёт блик по X в координатах окна:
 * у каждой буквы свой фон с полосой блика, смещённой так, чтобы полоса была под курсором.
 */
export interface ChromeText {
  readonly chars: HTMLElement[];
  readonly split: SplitText;
  /** Замерить буквы. Вызывать, когда буквы стоят на месте (без transform). */
  measure(): void;
  /** Поставить блик под координату X окна. */
  setSheen(clientX: number): void;
  /** Проехать бликом от X до X за duration. */
  sweep(fromX: number, toX: number, duration?: number): gsap.core.Tween;
  /** Статичный блик (reduced-motion): примерно на трети строки. */
  rest(): void;
}

interface Box {
  left: number;
  width: number;
}

export function chromeText(el: HTMLElement, opts: { mask?: boolean } = {}): ChromeText {
  const split = SplitText.create(el, {
    type: 'chars',
    charsClass: 'chrome-char',
    mask: opts.mask ? 'chars' : undefined,
    maskClass: 'chrome-mask',
    aria: 'auto',
  });
  const chars = split.chars as HTMLElement[];
  let boxes: Box[] = [];

  const measure = (): void => {
    boxes = chars.map((c) => {
      const r = c.getBoundingClientRect();
      return { left: r.left, width: r.width };
    });
  };

  const setSheen = (clientX: number): void => {
    for (let i = 0; i < chars.length; i++) {
      const b = boxes[i];
      if (!b) continue;
      // Фон буквы: 400% ширины, центр полосы блика на 50% = 2w от левого края фона
      chars[i].style.setProperty('--sx', `${clientX - b.left - 2 * b.width}px`);
    }
  };

  const sweep = (fromX: number, toX: number, duration = 1.2): gsap.core.Tween => {
    const proxy = { x: fromX };
    setSheen(fromX);
    return gsap.to(proxy, {
      x: toX,
      duration,
      ease: 'power2.inOut',
      onUpdate: () => setSheen(proxy.x),
    });
  };

  const rest = (): void => {
    measure();
    const r = el.getBoundingClientRect();
    setSheen(r.left + r.width * 0.32);
  };

  document.fonts?.ready.then(measure);
  window.addEventListener('resize', measure, { passive: true });
  measure();

  return { chars, split, measure, setSheen, sweep, rest };
}
