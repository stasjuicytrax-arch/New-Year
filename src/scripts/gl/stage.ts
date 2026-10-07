import { OrthographicCamera, Scene, WebGLRenderer } from 'three';

export interface StageLayer {
  /** Вызывается каждый кадр. dt в секундах, t. */
  update(frame: Frame): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

export interface Frame {
  dt: number;
  time: number;
  /** Скорость скролла, сглаженная, в долях высоты экрана в секунду (со знаком). */
  scrollVelocity: number;
  scrollY: number;
  /** Курсор в NDC (-1..1), только при fine pointer. */
  pointer: { x: number; y: number; active: boolean };
  /** Общий множитель яркости 0..1 (плавное включение). */
  fade: number;
}

/** Защита по времени кадра: если среднее за окно выше порога, вызывается onSlow (слой падает в статику). */
const SLOW_FRAME_MS = 34;
const SLOW_WINDOW = 90;
const SLOW_WARMUP_FRAMES = 60;

export interface StageOptions {
  canvas: HTMLCanvasElement;
  /** Максимум devicePixelRatio. TZ §6: min(dpr, 1.75). */
  maxPixelRatio: number;
  /** Реагировать на курсор (hover: hover и pointer: fine). */
  pointer: boolean;
  /** Устройство не тянет: средний кадр дольше SLOW_FRAME_MS. */
  onSlow?: () => void;
}

/**
 * Единственный WebGL-контекст страницы (TZ §6). Слои (снег, боке, потом шар и зеркальный шар)
 * подключаются через addLayer. Рендер встаёт на паузу, когда вкладка скрыта.
 */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  private layers: StageLayer[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  private running = false;
  private pixelRatio = 1;
  private width = 1;
  private height = 1;
  private lastScrollY = 0;
  private velocity = 0;
  private fade = 0;
  private fadeTarget = 0;
  private frames = 0;
  private slowAcc = 0;
  private slowCount = 0;
  private readonly pointer = { x: 0, y: 0, active: false };
  private readonly resizeObserver: ResizeObserver;

  constructor(private readonly opts: StageOptions) {
    this.renderer = new WebGLRenderer({
      canvas: opts.canvas,
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      premultipliedAlpha: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.lastScrollY = window.scrollY;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(document.documentElement);
    this.resize();

    document.addEventListener('visibilitychange', this.onVisibility);
    if (opts.pointer) window.addEventListener('pointermove', this.onPointer, { passive: true });
    document.documentElement.addEventListener('pointerleave', this.onLeave);
  }

  addLayer(layer: StageLayer): void {
    this.layers.push(layer);
    layer.resize(this.width, this.height, this.pixelRatio);
  }

  /** Плавное включение/выключение всего слоя за `seconds`. */
  fadeTo(value: number, seconds = 1.6): void {
    this.fadeTarget = value;
    this.fadeSpeed = seconds > 0 ? 1 / seconds : 1000;
  }
  private fadeSpeed = 1 / 1.6;

  start(): void {
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    this.lastScrollY = window.scrollY;
    this.slowAcc = 0;
    this.slowCount = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose(): void {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pointermove', this.onPointer);
    document.documentElement.removeEventListener('pointerleave', this.onLeave);
    this.resizeObserver.disconnect();
    this.layers.forEach((l) => l.dispose());
    this.layers = [];
    this.renderer.dispose();
  }

  private onVisibility = (): void => {
    if (document.hidden) this.stop();
    else this.start();
  };

  private onPointer = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') return;
    this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    this.pointer.active = true;
  };

  private onLeave = (): void => {
    this.pointer.active = false;
  };

  private resize(): void {
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.opts.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.layers.forEach((l) => l.resize(this.width, this.height, this.pixelRatio));
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    const rawMs = now - this.last;
    const dt = Math.min(0.05, rawMs / 1000);
    this.last = now;
    this.time += dt;

    // Защита по времени кадра: первые кадры (компиляция шейдеров) не считаем
    if (this.opts.onSlow && ++this.frames > SLOW_WARMUP_FRAMES && !document.hidden) {
      this.slowAcc += Math.min(rawMs, 200);
      if (++this.slowCount >= SLOW_WINDOW) {
        const avg = this.slowAcc / this.slowCount;
        this.slowAcc = 0;
        this.slowCount = 0;
        if (avg > SLOW_FRAME_MS) {
          this.opts.onSlow();
          return;
        }
      }
    }

    // Скорость скролла: читаем позицию раз в кадр (без слушателя scroll)
    const y = window.scrollY;
    const instant = dt > 0 ? (y - this.lastScrollY) / this.height / dt : 0;
    this.lastScrollY = y;
    this.velocity += (instant - this.velocity) * Math.min(1, dt * 6);

    const d = this.fadeTarget - this.fade;
    this.fade += Math.sign(d) * Math.min(Math.abs(d), dt * this.fadeSpeed);

    const frame: Frame = {
      dt,
      time: this.time,
      scrollVelocity: this.velocity,
      scrollY: y,
      pointer: this.pointer,
      fade: this.fade,
    };
    for (const l of this.layers) l.update(frame);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.tick);
  };
}
