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

/** Центры столов на rassadka.jpg (пиксели 960×1280). Порядок и взаимное расположение сохранены. */
const SOURCE: ReadonlyArray<readonly [n: number, x: number, y: number]> = [
  [1, 135, 703],
  [2, 135, 840],
  [3, 290, 935],
  [4, 288, 630],
  [5, 455, 1075],
  [6, 288, 1075],
  [7, 145, 1075],
  [8, 140, 935],
  [9, 410, 583],
  [10, 152, 583],
  [11, 298, 470],
  [12, 152, 470],
  [13, 298, 320],
  [14, 152, 320],
  [15, 215, 205],
];

/** Растяжение раскладки: стулья соседних столов (2 и 8, 10 и 1) на исходной схеме почти касаются, на экране им нужен воздух. */
const K = 1.25;
const ORIGIN = { x: 40, y: 96 };
const PAD = 20;
const toHall = (x: number, y: number): [number, number] => [(x - ORIGIN.x) * K + PAD, (y - ORIGIN.y) * K + PAD];

const zoneOf = (n: number): Zone['id'] => (n <= 2 ? 1 : n <= 5 ? 2 : 3);

export const TABLES: readonly HallTable[] = SOURCE.map(([n, x, y]) => {
  const [hx, hy] = toHall(x, y);
  return { n, zone: zoneOf(n), x: Math.round(hx * 10) / 10, y: Math.round(hy * 10) / 10 };
}).sort((a, b) => a.n - b.n);

/** Контур зала и сцена (по тому же преобразованию). */
const rectOf = (x1: number, y1: number, x2: number, y2: number) => {
  const [x, y] = toHall(x1, y1);
  const [x3, y3] = toHall(x2, y2);
  return { x, y, w: x3 - x, h: y3 - y };
};
export const HALL = rectOf(50, 110, 582, 1172);
export const STAGE = rectOf(345, 648, 530, 925);
export const VIEWBOX = { w: Math.round(HALL.x + HALL.w + PAD), h: Math.round(HALL.y + HALL.h + PAD) };

/** Размеры в единицах viewBox. */
export const GEOM = { table: 31, orbit: 45, seat: 9, seatHit: 13, tableHit: 58 } as const;

/** Центр стула: номер 1 справа от верхней точки, дальше по часовой стрелке; смещение 22,5° разводит стулья соседних столов. */
export function seatPos(t: HallTable, seat: number): { x: number; y: number } {
  const a = ((-90 + 22.5 + (seat - 1) * 45) * Math.PI) / 180;
  return { x: t.x + Math.cos(a) * GEOM.orbit, y: t.y + Math.sin(a) * GEOM.orbit };
}

export const zoneById = (id: Zone['id']): Zone => ZONES.find((z) => z.id === id)!;
export const tableByN = (n: number): HallTable => TABLES.find((t) => t.n === n)!;
export const seatKey = (table: number, seat: number): string => `${table}-${seat}`;
export const seatPrice = (table: number, kind: SeatKind): number => (kind === 'child' ? CHILD_PRICE : zoneById(tableByN(table).zone).price);
