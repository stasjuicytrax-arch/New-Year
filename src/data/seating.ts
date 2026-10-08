/**
 * Схема зала WHITE HALL: 15 круглых столов по 8 мест (120 мест за столами). Источник раскладки: rassadka.jpg (ТЗ клиента).
 * «ТОП-150» на сайте — общее число гостей, к этим 120 местам отношения не имеет.
 */
import { prices } from '../content/content';

export const SEATS_PER_TABLE = 8;
export const CHILD_PRICE: number = prices.child;

/**
 * Статус мест. Сейчас статический файл (все места свободны). Позже заменить адресом функции Яндекса:
 * одна константа, формат ответа тот же: { "seats": { "7-3": "held", "2-1": "booked" } }, остальные места свободны.
 */
export const SEATING_STATUS_URL = `${import.meta.env.BASE_URL}seating-status.json`;

export type SeatStatus = 'free' | 'held' | 'booked';
export type SeatKind = 'adult' | 'child';

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
  { id: 2, name: '2-я линия', tables: 'столы 3–5', price: 17000, color: '#6cb1ff' },
  { id: 3, name: '3-я линия', tables: 'столы 6–15', price: 15000, color: '#6fbf9e' },
];

export interface HallTable {
  n: number;
  zone: Zone['id'];
  /** Центр стола в единицах viewBox схемы. */
  x: number;
  y: number;
}

/** Размеры в единицах viewBox. Стул — капсула 14×8 по касательной к столу. */
export const GEOM = { table: 26, orbit: 38, seatW: 16, seatD: 10, seatHit: 12, tableHit: 54 } as const;

/**
 * Раскладка по сетке, взаимное расположение как на rassadka.jpg: три колонки (слева, центр, справа), восемь рядов.
 * Шаг сетки 160: между краями стульев соседних столов остаётся ≥ 1,5 диаметра стола (2 × 26 × 1,5 = 78 при зазоре 78+).
 * Стол 15 стоит между левой и центральной колонками, как на исходнике.
 */
const PITCH = 160;
const MARGIN = 30;
const WALL_GAP = 85;
const COL = (i: number): number => MARGIN + WALL_GAP + i * PITCH;
const ROW = (i: number): number => MARGIN + WALL_GAP + i * PITCH;

/** [номер, колонка, ряд] */
const GRID: ReadonlyArray<readonly [n: number, col: number, row: number]> = [
  [15, 0.5, 0],
  [14, 0, 1],
  [13, 1, 1],
  [12, 0, 2],
  [11, 1, 2],
  [10, 0, 3],
  [4, 1, 3],
  [9, 2, 3],
  [1, 0, 4],
  [2, 0, 5],
  [8, 0, 6],
  [3, 1, 6],
  [7, 0, 7],
  [6, 1, 7],
  [5, 2, 7],
];

const zoneOf = (n: number): Zone['id'] => (n <= 2 ? 1 : n <= 5 ? 2 : 3);

export const TABLES: readonly HallTable[] = GRID.map(([n, c, r]) => ({ n, zone: zoneOf(n), x: COL(c), y: ROW(r) })).sort((a, b) => a.n - b.n);

/** Контур зала, сцена, танцпол, вход (единицы viewBox). */
const hallRight = COL(2) + WALL_GAP;
const hallBottom = ROW(7) + WALL_GAP;
export const HALL = { x: MARGIN, y: MARGIN, w: hallRight - MARGIN, h: hallBottom - MARGIN };
export const VIEWBOX = { w: hallRight + MARGIN, h: hallBottom + 46 };

/** Сцена у правой стены, передний край (дуга) смотрит в зал. */
const stageX = COL(1) + 70;
const stageY = ROW(4) - 60;
export const STAGE = { x: stageX, y: stageY, w: hallRight - 16 - stageX, h: PITCH + 110 };

/** Танцпол между столами 1–2 и сценой. */
const danceX = COL(0) + 62;
export const DANCE = { x: danceX, y: ROW(3) + 78, w: STAGE.x - 16 - danceX, h: ROW(5) + 92 - (ROW(3) + 78) };

/** Вход: проём в нижней стене у правого угла (по исходнику рядом с лестницей). */
export const DOOR = { x: COL(2) + 20, w: 56, y: hallBottom };

/** Окна на левой стене (отметки): центры по высоте. */
export const WINDOWS = [ROW(0.9), ROW(2.5), ROW(4.5), ROW(6.1)].map((y) => Math.round(y));

/** Центр стула: номер 1 справа от верхней точки, дальше по часовой стрелке; смещение 22,5° разводит стулья соседних столов.
 *  rot — поворот капсулы (градусы): длинная сторона по касательной, «спинка» наружу. */
export function seatPos(t: HallTable, seat: number): { x: number; y: number; rot: number } {
  const deg = -90 + 22.5 + (seat - 1) * 45;
  const a = (deg * Math.PI) / 180;
  return { x: t.x + Math.cos(a) * GEOM.orbit, y: t.y + Math.sin(a) * GEOM.orbit, rot: deg + 90 };
}

export const zoneById = (id: Zone['id']): Zone => ZONES.find((z) => z.id === id)!;
export const tableByN = (n: number): HallTable => TABLES.find((t) => t.n === n)!;
export const seatKey = (table: number, seat: number): string => `${table}-${seat}`;
export const seatPrice = (table: number, kind: SeatKind): number => (kind === 'child' ? CHILD_PRICE : zoneById(tableByN(table).zone).price);
