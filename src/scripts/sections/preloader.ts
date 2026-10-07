import snowflakeSvg from '../../assets/deco/snowflake.svg?raw';
import { gsap } from '../scroll';

/**
 * Прелоадер 2026 > 2027 (TZ §5.0, DESIGN-SYSTEM §7.11). Не дольше ~2.2 с, только при первом визите в сессии.
 * Чёрный экран, снежинка-глиф рисуется линией, табло 2026 перещёлкивается на 2027 (хром),
 * цифры разлетаются частицами-снежинками, которые становятся снегом сайта.
 */
export const PRELOAD_KEY = 'gnn-preloaded';

export interface PreloaderOptions {
  /** Ассеты hero готовы (шрифты, фигура ведущих). */
  ready: Promise<unknown>;
  /** Момент разлёта цифр: включить снег сайта. */
  onBurst: () => void;
}

const FROM = '2026';
const TO = '2027';

function digitSlot(from: string, to: string): string {
  return `<span class="pre-digit"><span class="pre-digit__roll"><span>${from}</span><span>${to}</span></span></span>`;
}

export function shouldPreload(): boolean {
  try {
    if (sessionStorage.getItem(PRELOAD_KEY)) return false;
  } catch {
    /* sessionStorage недоступен: показываем прелоадер */
  }
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Возвращает промис, который выполняется в момент разлёта: с него можно запускать вход hero. */
export function runPreloader({ ready, onBurst }: PreloaderOptions): Promise<void> {
  try {
    sessionStorage.setItem(PRELOAD_KEY, '1');
  } catch {
    /* ignore */
  }

  const root = document.createElement('div');
  root.className = 'preloader';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-label', 'Загрузка сайта');
  root.innerHTML = `
    <div class="preloader__core">
      <div class="preloader__glyph">${snowflakeSvg.replace('<path ', '<path pathLength="1" ')}</div>
      <div class="preloader__board" aria-hidden="true">
        ${FROM.split('')
          .map((ch, i) => digitSlot(ch, TO[i]))
          .join('')}
      </div>
    </div>`;
  const canvas = document.createElement('canvas');
  canvas.className = 'preloader__burst';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(root, canvas);

  const glyph = root.querySelector<SVGPathElement>('.preloader__glyph path')!;
  const board = root.querySelector<HTMLElement>('.preloader__board')!;
  const slots = [...root.querySelectorAll<HTMLElement>('.pre-digit')];
  const rolls = [...root.querySelectorAll<HTMLElement>('.pre-digit__roll')];

  return new Promise<void>((resolveBurst) => {
    let burstDone = false;
    const burst = (): void => {
      if (burstDone) return;
      burstDone = true;
      onBurst();
      fly(canvas, slots, () => canvas.remove());
      gsap.to(root, { opacity: 0, duration: 0.55, ease: 'power2.out', onComplete: () => root.remove() });
      document.documentElement.classList.remove('preloading');
      resolveBurst();
    };

    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    gsap.set(glyph, { strokeDasharray: 1, strokeDashoffset: 1 });
    gsap.set(board, { opacity: 0, y: 14 });

    tl.to(glyph, { strokeDashoffset: 0, duration: 0.85, ease: 'power2.inOut' }, 0)
      .to(glyph, { opacity: 0.55, duration: 0.5 }, 0.9)
      .to(board, { opacity: 1, y: 0, duration: 0.5 }, 0.45)
      // Табло щёлкает: только последняя цифра 6 > 7, быстро и с небольшим «отскоком»
      .addLabel('flip', 1.15)
      .to(rolls[3], { yPercent: -50, duration: 0.22, ease: 'steps(3)' }, 'flip')
      .fromTo(board, { filter: 'brightness(1)' }, { filter: 'brightness(1.9)', duration: 0.08, yoyo: true, repeat: 1 }, 'flip')
      .addLabel('hold', '>0.05')
      .call(
        () => {
          // Ждём ассеты hero, но не дольше 3 с после щелчка
          Promise.race([ready, new Promise((r) => setTimeout(r, 3000))]).then(burst);
        },
        undefined,
        'hold',
      );

    // Пропуск кликом или клавишей (когда ассеты готовы)
    const skip = (): void => {
      ready.then(() => {
        if (burstDone) return;
        tl.progress(1, true);
        burst();
      });
    };
    root.addEventListener('pointerdown', skip, { once: true });
    window.addEventListener('keydown', skip, { once: true });
  });
}

/** Частицы-снежинки из пикселей цифр: разлёт и мягкое оседание в снег сайта. */
function fly(canvas: HTMLCanvasElement, slots: HTMLElement[], done: () => void): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return done();
  ctx.scale(dpr, dpr);

  // Снимаем маску цифр: рисуем те же символы тем же шрифтом
  const mobile = W < 768;
  const step = mobile ? 5 : 6;
  const max = mobile ? 360 : 720;
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const o = off.getContext('2d', { willReadFrequently: true })!;
  const cs = getComputedStyle(slots[0]);
  o.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  o.textAlign = 'center';
  o.textBaseline = 'alphabetic';
  o.fillStyle = '#fff';
  slots.forEach((s, i) => {
    const r = s.getBoundingClientRect();
    const ch = i === slots.length - 1 ? TO[i] : FROM[i];
    o.fillText(ch, r.left + r.width / 2, r.top + r.height * 0.82);
  });

  const img = o.getImageData(0, 0, W, H).data;
  type P = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; a: number };
  const ps: P[] = [];
  const cx = W / 2, cy = H / 2;
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (img[(y * W + x) * 4 + 3] > 128 && ps.length < max) {
        const dx = x - cx, dy = y - cy;
        const len = Math.hypot(dx, dy) || 1;
        const sp = 0.6 + Math.random() * 2.4;
        ps.push({
          x, y,
          vx: (dx / len) * sp + (Math.random() - 0.5) * 1.2,
          vy: (dy / len) * sp * 0.6 - Math.random() * 1.4,
          r: 0.9 + Math.random() * 2.2,
          life: 0,
          max: 70 + Math.random() * 80,
          a: 0.6 + Math.random() * 0.4,
        });
      }
    }
  }

  let frame = 0;
  const tick = (): void => {
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of ps) {
      p.life++;
      if (p.life > p.max) continue;
      alive++;
      // Сначала разлёт, потом медленное падение как снег
      p.vx *= 0.985;
      p.vy = p.vy * 0.96 + 0.035;
      p.x += p.vx + Math.sin((p.life + p.x) * 0.05) * 0.25;
      p.y += p.vy;
      const t = p.life / p.max;
      ctx.globalAlpha = p.a * (1 - t * t);
      ctx.fillStyle = '#f5f8fc';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    frame++;
    if (alive && frame < 260) requestAnimationFrame(tick);
    else done();
  };
  requestAnimationFrame(tick);
}
