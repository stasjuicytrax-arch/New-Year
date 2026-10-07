import type { Stage } from './stage';

/**
 * WebGL-слой страницы: снег (3 глубины) + боке, один контекст.
 * Режимы (html[data-fx]):
 *  full   : desktop, 1200 снежинок, курсорные эффекты при fine pointer;
 *  lite   : mobile / coarse pointer, 400 снежинок (в 3 раза меньше), без курсора;
 *  static : prefers-reduced-motion, нет WebGL или слабое устройство: статичный WebP-слой.
 */
export type FxMode = 'full' | 'lite' | 'static';

export interface Effects {
  readonly mode: FxMode;
  /** Плавно включить/выключить снег и боке (например, после прелоадера). */
  fadeTo(value: number, seconds?: number): void;
}

const SNOW = { full: 1000, lite: 330 } as const;
const BOKEH = { full: 30, lite: 10 } as const;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const mobile = window.matchMedia('(max-width: 767px), (pointer: coarse)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    // Пробный контекст сразу отдаём: браузеры ограничивают число живых контекстов
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

function lowEnd(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) || navigator.hardwareConcurrency <= 2;
}

function pickMode(): FxMode {
  if (reducedMotion.matches || !hasWebGL() || lowEnd()) return 'static';
  return mobile.matches ? 'lite' : 'full';
}

function el<T extends HTMLElement>(tag: string, className: string): T {
  const node = document.createElement(tag) as T;
  node.className = className;
  node.setAttribute('aria-hidden', 'true');
  document.body.prepend(node);
  return node;
}

export async function initEffects(): Promise<Effects> {
  let mode = pickMode();
  let stage: Stage | null = null;
  let pendingFade = 0; // включает вызывающий (прелоадер или main), чтобы снег не появлялся раньше времени
  let pendingSeconds = 1.6;
  let canvas: HTMLCanvasElement | null = null;
  let staticLayer: HTMLElement | null = null;

  const apply = async (next: FxMode): Promise<void> => {
    stage?.dispose();
    stage = null;
    canvas?.remove();
    canvas = null;
    staticLayer?.remove();
    staticLayer = null;
    mode = next;
    document.documentElement.dataset.fx = next;

    if (next === 'static') {
      staticLayer = el('div', 'gl-static');
      return;
    }

    const [{ Stage }, { createSnow }, { createBokeh }] = await Promise.all([
      import('./stage'),
      import('./snow'),
      import('./bokeh'),
    ]);
    // Пока грузился three, режим мог смениться (например, включили reduced-motion)
    if (mode !== next) return;

    canvas = el<HTMLCanvasElement>('canvas', 'gl-canvas');
    try {
      stage = new Stage({
        canvas,
        maxPixelRatio: next === 'lite' ? 1.5 : 1.75,
        pointer: next === 'full' && finePointer.matches,
        // Слабое устройство: средний кадр дольше ~34 мс, падаем в статику
        onSlow: () => void apply('static'),
      });
    } catch {
      await apply('static');
      return;
    }
    // Контекст может быть потерян (память, фоновая вкладка на mobile). Ждём восстановления
    // 3 секунды и пересобираем слой в том же режиме; не дождались: статика.
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      const lost = canvas;
      const timer = window.setTimeout(() => void apply('static'), 3000);
      lost?.addEventListener(
        'webglcontextrestored',
        () => {
          window.clearTimeout(timer);
          if (mode === next) void apply(next);
        },
        { once: true },
      );
    });
    stage.addLayer(createBokeh(stage, { count: BOKEH[next] }));
    stage.addLayer(createSnow(stage, { count: SNOW[next] }));
    stage.fadeTo(pendingFade, pendingSeconds);
    stage.start();
  };

  await apply(mode);

  // Смена системных настроек на лету
  const reevaluate = (): void => {
    const next = pickMode();
    if (next !== mode) void apply(next);
  };
  reducedMotion.addEventListener('change', reevaluate);
  mobile.addEventListener('change', reevaluate);

  return {
    get mode() {
      return mode;
    },
    fadeTo(value, seconds = 1.6) {
      pendingFade = value;
      pendingSeconds = seconds;
      stage?.fadeTo(value, seconds);
    },
  };
}
