/**
 * Схема зала WHITE HALL: 15 круглых столов по 8 мест (120 мест за столами). Источник раскладки: rassadka.jpg (ТЗ клиента).
 * «ТОП-150» на сайте — общее число гостей, к этим 120 местам отношения не имеет.
 */
import { prices } from '../content/content';
import approved from './seating-approved.json';

export const SEATS_PER_TABLE = 8;
/** Детский билет — входной, без места за столом (отдельный детский зал). */
export const CHILD_PRICE: number = prices.child;
export const KIDS_MAX = 10;
export const KID_AGE = { min: 4, max: 14, byDefault: 6 } as const;

/**
 * Статус мест. Сейчас статический файл (все места свободны). Позже заменить адресом функции Яндекса:
 * одна константа, формат ответа тот же: { "seats": { "7-3": "held", "2-1": "booked" } }, остальные места свободны.
 */
export const SEATING_STATUS_URL = `${import.meta.env.BASE_URL}seating-status.json`;

export type SeatStatus = 'free' | 'held' | 'booked';

export interface Zone {
  id: 1 | 2 | 3;
  name: string;
  /** Подпись столов для легенды. */
  tables: string;
  price: number;
  /** Цвет зоны (CSS). Подобраны под палитру сайта: золото, ледяной голубой, приглушённая мята. */
  color: string;
}

export const ZONES: readonly Zone[] = [
  { id: 1, name: '1-я линия', tables: 'столы 1–2', price: 20000, color: '#e6c27a' },
  { id: 2, name: '2-я линия', tables: 'столы 3, 4, 8, 10', price: 17000, color: '#6cb1ff' },
  { id: 3, name: '3-я линия', tables: 'столы 5–7, 9, 11–15', price: 15000, color: '#6fbf9e' },
];

export interface HallTable {
  n: number;
  zone: Zone['id'];
  /** Центр стола в единицах viewBox схемы. */
  x: number;
  y: number;
}

/** Размеры в единицах viewBox. Стул — капсула по касательной к столу. */
export const GEOM = { table: 26, orbit: 40, seatW: 18, seatD: 14, seatHit: 12, tableHit: 60 } as const;

/**
 * Опорные размеры контура зала. Центры столов берутся из утверждённой схемы ниже.
 */
const PITCH = 160;
const MARGIN = 30;
const WALL_GAP = 85;
const COL = (i: number): number => MARGIN + WALL_GAP + i * PITCH;
const ROW = (i: number): number => MARGIN + WALL_GAP + i * PITCH;

/** Центры и каждый стул перенесены с утверждённой схемы v3 (docs/seating-approved.svg).
 * Масштаб центров оставляет проходы между столами; стулья сохраняют исходные смещения и пустые сектора. */
const PLAN_SCALE = 1.27;
const CHAIR_SCALE = GEOM.orbit / 50;

/** Столы по 17 000 ₽; остальные с 3-го по 15-й по 15 000 ₽. */
const ZONE2 = new Set([3, 4, 8, 10]);
const zoneOf = (n: number): Zone['id'] => (n <= 2 ? 1 : ZONE2.has(n) ? 2 : 3);

export const TABLES: readonly HallTable[] = approved.tables.map(({ n, x, y }) => ({
  n, zone: zoneOf(n), x: COL(0) + (x - 151) * PLAN_SCALE, y: ROW(0) + (y - 203) * PLAN_SCALE,
}));

/** Контур зала, сцена, танцпол, вход (единицы viewBox). */
const hallRight = Math.max(...TABLES.map((t) => t.x)) + WALL_GAP;
const hallBottom = ROW(7) + WALL_GAP;
export const HALL = { x: MARGIN, y: MARGIN, w: hallRight - MARGIN, h: hallBottom - MARGIN };
/** Справа (в горизонтальной раскладке сверху) запас под подпись входа. */
export const VIEWBOX = { w: hallRight + 66, h: hallBottom + MARGIN };

/** Сцена у правой стены, передний край (дуга) смотрит в зал. */
const stageX = COL(1) + 70;
const stageY = ROW(4) - 60;
export const STAGE = { x: stageX, y: stageY, w: hallRight - 16 - stageX, h: PITCH + 110 };

/** Танцпол между столами 1–2 и сценой. */
const danceX = COL(0) + 62;
export const DANCE = { x: danceX, y: ROW(3) + 78, w: STAGE.x - 16 - danceX, h: ROW(5) + 92 - (ROW(3) + 78) };

/** Вход: на правой стене исходника, на уровне стола 11 (справа от него, где стена и лестница). В горизонтальной раскладке это верхняя стена, точно над столом 11. */
export const DOOR = { w: 56, y: TABLES.find((t) => t.n === 11)!.y };

/** Окна на левой стене (отметки): центры по высоте. */
export const WINDOWS = [ROW(0.9), ROW(2.5), ROW(4.5), ROW(6.1)].map((y) => Math.round(y));

/** t — центр стола в выбранной ориентации. Стул и его поворот преобразуются вместе с залом.
 * Индекс в approved.seats — существующий номер места 1–8; ключи броней не меняются. */
export function seatPos(t: HallTable, seat: number, orient: Orient = 'v'): { x: number; y: number; rot: number } {
  const ref = approved.tables.find((table) => table.n === t.n);
  const chair = ref?.seats[seat - 1];
  if (!ref || !chair) throw new RangeError(`Unknown seat ${t.n}-${seat}`);
  const dx = (chair[0] - ref.x) * CHAIR_SCALE;
  const dy = (chair[1] - ref.y) * CHAIR_SCALE;
  const deg = Math.atan2(dy, dx) * 180 / Math.PI;
  return orient === 'v'
    ? { x: t.x + dx, y: t.y + dy, rot: deg + 90 }
    : { x: t.x + dy, y: t.y - dx, rot: deg };
}

export const zoneById = (id: Zone['id']): Zone => ZONES.find((z) => z.id === id)!;
export const tableByN = (n: number): HallTable => TABLES.find((t) => t.n === n)!;
export const seatKey = (table: number, seat: number): string => `${table}-${seat}`;
export const seatPrice = (table: number): number => zoneById(tableByN(table).zone).price;

/**
 * Две ориентации одной схемы. 'v' — вертикальная (телефон): сцена справа. 'h' — горизонтальная (десктоп): зал повёрнут
 * на 90° против часовой стрелки, сцена сверху; взаимное расположение столов относительно сцены сохраняется.
 */
export type Orient = 'v' | 'h';
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Layout {
  orient: Orient;
  tables: HallTable[];
  hall: Rect;
  stage: Rect;
  dance: Rect;
  viewBox: { w: number; h: number };
  /** Точка вертикальной раскладки → координаты этой раскладки. */
  pt: (x: number, y: number) => [number, number];
}

export function layoutFor(orient: Orient): Layout {
  const vw = VIEWBOX.w;
  const vh = VIEWBOX.h;
  const v = orient === 'v';
  const pt = (x: number, y: number): [number, number] => (v ? [x, y] : [y, vw - x]);
  const rc = (r: Rect): Rect => (v ? r : { x: r.y, y: vw - r.x - r.w, w: r.h, h: r.w });
  return {
    orient,
    tables: TABLES.map((t) => {
      const [x, y] = pt(t.x, t.y);
      return { ...t, x, y };
    }),
    hall: rc(HALL),
    stage: rc(STAGE),
    dance: rc(DANCE),
    viewBox: v ? { w: vw, h: vh } : { w: vh, h: vw },
    pt,
  };
}

/**
 * 3D-вид («Зал 1.jpg», вырезка без фона: scripts/build-hall3d.mjs). Зоны столов — доли ширины/высоты кадра картинки.
 * На визуализации 14 столов (на схеме 15): стола 8 в 3D нет. Номера подобраны по взаимному расположению
 * (сцена справа, окна справа и сверху) и совпадают рядами со схемой: 15 | 14 13 | 12 11 | 10 4 9 | 1 | 2 3 | 7 6 5.
 * Правится только здесь.
 */
export interface Hot3d {
  /** Номер стола на схеме. */
  n: number;
  /** Центр стола в долях кадра (x — от ширины, y — от высоты). */
  x: number;
  y: number;
}
export const HALL3D_R = 0.088; // радиус зоны стола в долях ширины кадра (стол со стульями)
export const HALL3D: readonly Hot3d[] = [
  { n: 15, x: 0.39, y: 0.196 },
  { n: 14, x: 0.289, y: 0.258 },
  { n: 13, x: 0.491, y: 0.26 },
  { n: 12, x: 0.278, y: 0.348 },
  { n: 11, x: 0.491, y: 0.35 },
  { n: 10, x: 0.267, y: 0.434 },
  { n: 4, x: 0.491, y: 0.457 },
  { n: 9, x: 0.685, y: 0.419 },
  { n: 1, x: 0.251, y: 0.57 },
  { n: 2, x: 0.234, y: 0.696 },
  { n: 3, x: 0.499, y: 0.692 },
  { n: 7, x: 0.213, y: 0.845 },
  { n: 6, x: 0.499, y: 0.842 },
  { n: 5, x: 0.782, y: 0.845 },
];
