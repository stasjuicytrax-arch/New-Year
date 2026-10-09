import { prices, seating as t, typo } from '../../content/content';
import meta3d from '../../assets/img/hall3d-meta.json';
import { picture } from '../media';
import {
  CHILD_PRICE,
  DANCE,
  DOOR,
  GEOM,
  HALL,
  HALL3D,
  HALL3D_R,
  KIDS_MAX,
  KID_AGE,
  SEATING_STATUS_URL,
  SEATS_PER_TABLE,
  STAGE,
  TABLES,
  WINDOWS,
  ZONES,
  layoutFor,
  seatKey,
  seatPos,
  seatPrice,
  tableByN,
  zoneById,
  type HallTable,
  type Layout,
  type SeatStatus,
} from '../../data/seating';

/**
 * Блок «Выберите места» (#seats): SVG-схема зала, выбор мест, панель итога, карточка стола для телефона,
 * pinch/pan + кнопки масштаба, список столов. Состояние выбора отдаётся форме брони через onSelectionChange.
 */

export interface Pick {
  table: number;
  seat: number;
}

const picks = new Map<string, Pick>();
const status = new Map<string, SeatStatus>();
/** Детские билеты: возраст каждого ребёнка. Без мест, без привязки к схеме. */
const kids: number[] = [];
const listeners = new Set<() => void>();

const fmt = (n: number): string => new Intl.NumberFormat('ru-RU').format(n).replace(/\s/g, ' ');
const rub = (n: number): string => `${fmt(n)} ${prices.currency}`;
const plural = (n: number, f: [string, string, string]): string => {
  const m = n % 100;
  const d = n % 10;
  return m >= 11 && m <= 14 ? f[2] : d === 1 ? f[0] : d >= 2 && d <= 4 ? f[1] : f[2];
};
const seatsWord = (n: number): string => `${n} ${plural(n, ['место', 'места', 'мест'])}`;
const statusOf = (key: string): SeatStatus => status.get(key) ?? 'free';
const MAX_PICKS = 40;

/* ---------- публичное API для формы ---------- */

export function getPicks(): Pick[] {
  return [...picks.values()].sort((a, b) => a.table - b.table || a.seat - b.seat);
}
export const pickPrice = (p: Pick): number => seatPrice(p.table);
export const seatsTotal = (): number => getPicks().reduce((s, p) => s + pickPrice(p), 0);
export const getKids = (): number[] => [...kids];
export const kidsTotal = (): number => kids.length * CHILD_PRICE;
export const totalPrice = (): number => seatsTotal() + kidsTotal();
export const hasSelection = (): boolean => picks.size > 0 || kids.length > 0;

const ageWord = (a: number): string => (a >= 5 && a <= 20 ? 'лет' : a % 10 === 1 ? 'год' : a % 10 >= 2 && a % 10 <= 4 ? 'года' : 'лет');

/** «Детские билеты: 2 (6 и 9 лет) — 14 000 ₽» */
export function kidsText(): string {
  if (!kids.length) return '';
  const ages = [...kids].sort((a, b) => a - b);
  const list = ages.length === 1 ? `${ages[0]} ${ageWord(ages[0])}` : `${ages.slice(0, -1).join(', ')} и ${ages[ages.length - 1]} лет`;
  return `${t.kidsTitle}: ${kids.length} (${list}) — ${rub(kidsTotal())}`;
}

/** «Стол 7: места 1, 2 — 30 000 ₽» */
export const seatsText = (): string => (picks.size ? `${selectionText()} — ${rub(seatsTotal())}` : '');

/** «Стол 7: места 2, 3 · Стол 8: место 1» */
export function selectionText(): string {
  const byTable = new Map<number, number[]>();
  for (const p of getPicks()) byTable.set(p.table, [...(byTable.get(p.table) ?? []), p.seat]);
  return [...byTable].map(([n, s]) => `Стол ${n}: ${s.length === 1 ? 'место' : 'места'} ${s.join(', ')}`).join(' · ');
}

export function onSelectionChange(fn: () => void): void {
  listeners.add(fn);
}

/* ---------- разметка ---------- */

const stateWord = (p: Pick | undefined, st: SeatStatus): string => (p ? 'выбрано' : st === 'held' ? 'удержано' : st === 'booked' ? 'занято' : 'свободно');

const seatLabel = (n: number, s: number): string => {
  const key = seatKey(n, s);
  const p = picks.get(key);
  const price = p ? pickPrice(p) : seatPrice(n);
  return `Стол ${n}, место ${s}, ${rub(price)}, ${stateWord(p, statusOf(key))}`;
};

function tableMarkup(tb: HallTable): string {
  const z = zoneById(tb.zone);
  const chairs = Array.from({ length: SEATS_PER_TABLE }, (_, i) => {
    const s = i + 1;
    const { x, y, rot } = seatPos(tb, s);
    const fx = x.toFixed(1);
    const fy = y.toFixed(1);
    return `<g class="seat" role="button" tabindex="0" data-t="${tb.n}" data-s="${s}" aria-pressed="false" aria-label="${seatLabel(tb.n, s)}">
      <circle class="seat__hit" cx="${fx}" cy="${fy}" r="${GEOM.seatHit}"/>
      <rect class="seat__cap" x="${(x - GEOM.seatW / 2).toFixed(1)}" y="${(y - GEOM.seatD / 2).toFixed(1)}" width="${GEOM.seatW}" height="${GEOM.seatD}" rx="${GEOM.seatD / 2}" transform="rotate(${rot} ${fx} ${fy})"/>
      <path class="seat__check" d="M${(x - 2.6).toFixed(1)} ${(y + 0.1).toFixed(1)} l1.7 1.8 l3.5 -3.6"/>
    </g>`;
  }).join('');
  return `<g class="tbl" data-table="${tb.n}" data-zone="${tb.zone}" style="--zc:${z.color}">
    <circle class="tbl__body" cx="${tb.x}" cy="${tb.y}" r="${GEOM.table}"/>
    <circle class="tbl__rim" cx="${tb.x}" cy="${tb.y}" r="${GEOM.table - 5}"/>
    <circle class="tbl__hit" cx="${tb.x}" cy="${tb.y}" r="${GEOM.tableHit}" role="button" tabindex="0" data-hit="${tb.n}" aria-label="Стол ${tb.n}"/>
    <text class="tbl__no" x="${tb.x}" y="${tb.y}" aria-hidden="true">${tb.n}</text>
    ${chairs}
  </g>`;
}

function svgMarkup(L: Layout): string {
  const { w, h } = L.viewBox;
  const H = L.orient === 'h';
  const f = (n: number): string => n.toFixed(1);
  const pp = (x: number, y: number): string => {
    const [a, b] = L.pt(x, y);
    return `${f(a)} ${f(b)}`;
  };
  const pc = (x: number, y: number): string => {
    const [a, b] = L.pt(x, y);
    return `${f(a)},${f(b)}`;
  };
  // Сцена: передний край — дуга, обращённая в зал; прожекторы светят в танцпол (все точки заданы в вертикальной раскладке и поворачиваются)
  const sx = STAGE.x;
  const sy = STAGE.y;
  const sr = STAGE.x + STAGE.w;
  const sb = STAGE.y + STAGE.h;
  const mid = sy + STAGE.h / 2;
  const stagePath = `M${pp(sr, sy)} L${pp(sx + 26, sy)} Q${pp(sx - 30, mid)} ${pp(sx + 26, sb)} L${pp(sr, sb)} Z`;
  const edgePath = `M${pp(sx + 26, sy)} Q${pp(sx - 30, mid)} ${pp(sx + 26, sb)}`;
  const apexX = sx - 14;
  const cones = [0.24, 0.5, 0.76]
    .map((k) => {
      const ay = sy + STAGE.h * k;
      return `<polygon points="${pc(apexX, ay - 5)} ${pc(apexX, ay + 5)} ${pc(DANCE.x - 20, ay + 78)} ${pc(DANCE.x - 20, ay - 78)}" fill="url(#g-cone)"/>`;
    })
    .join('');
  const tbl = (n: number): HallTable => L.tables.find((t) => t.n === n)!;
  const t1 = tbl(1);
  const t2 = tbl(2);
  const gold = `<ellipse cx="${f((t1.x + t2.x) / 2)}" cy="${f((t1.y + t2.y) / 2)}" rx="${f(Math.abs(t2.x - t1.x) / 2 + 118)}" ry="${f(Math.abs(t2.y - t1.y) / 2 + 118)}" fill="url(#g-gold)"/>`;
  const blue = [3, 4, 5].map((n) => `<circle cx="${f(tbl(n).x)}" cy="${f(tbl(n).y)}" r="104" fill="url(#g-blue)"/>`).join('');
  const hl = L.hall;
  const hb = hl.y + hl.h;
  const windows = WINDOWS.map((wy) =>
    H
      ? `<g class="hall__win"><line x1="${wy - 38}" y1="${f(hb - 4)}" x2="${wy + 38}" y2="${f(hb - 4)}"/><line x1="${wy - 38}" y1="${f(hb + 4)}" x2="${wy + 38}" y2="${f(hb + 4)}"/></g>`
      : `<g class="hall__win"><line x1="${f(hl.x - 4)}" y1="${wy - 38}" x2="${f(hl.x - 4)}" y2="${wy + 38}"/><line x1="${f(hl.x + 4)}" y1="${wy - 38}" x2="${f(hl.x + 4)}" y2="${wy + 38}"/></g>`,
  ).join('');
  // Вход: на правой стене исходника на уровне стола 11; в горизонтальной раскладке это верхняя стена, точно над столом 11
  const [dx, dy] = L.pt(HALL.x + HALL.w, DOOR.y);
  const door = H
    ? `<rect x="${f(dx - (DOOR.w + 2) / 2)}" y="${f(dy - 3)}" width="${DOOR.w + 2}" height="6" rx="3" class="hall__gap"/>
        <path d="M${f(dx - 6)} ${f(dy - 19)} l6 8 l6 -8" class="hall__arrow"/>
        <text x="${f(dx)}" y="${f(dy - 28)}" class="hall__door-t">${t.entrance}</text>`
    : `<rect x="${f(dx - 3)}" y="${f(dy - (DOOR.w + 2) / 2)}" width="6" height="${DOOR.w + 2}" rx="3" class="hall__gap"/>
        <path d="M${f(dx + 22)} ${f(dy - 16)} l-8 6 l8 6" class="hall__arrow"/>
        <text x="${f(dx + 40)}" y="${f(dy + 14)}" class="hall__door-t">${t.entrance}</text>`;
  const [tx, ty] = L.pt(sx + STAGE.w / 2 + 8, mid);
  const stageGrad = H ? 'x1="0" y1="1" x2="0" y2="0"' : 'x1="0" y1="0" x2="1" y2="0"';
  const rimGrad = H ? 'x1="0" y1="0" x2="0" y2="1"' : 'x1="1" y1="0" x2="0" y2="0"';
  const coneGrad = H ? 'x1="0" y1="0" x2="0" y2="1"' : 'x1="1" y1="0" x2="0" y2="0"';
  const d = L.dance;
  return `<svg class="hallmap" viewBox="0 0 ${w} ${h}" role="group" aria-label="${t.mapAria}" data-svg data-orient="${L.orient}">
    <defs>
      <pattern id="seat-hatch" width="4.5" height="4.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="4.5" height="4.5" fill="#2b2a18"/>
        <line x1="0" y1="0" x2="0" y2="4.5" stroke="#f4d24e" stroke-width="2.2"/>
      </pattern>
      <pattern id="p-floor" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#abc3e4" stroke-opacity="0.11" stroke-width="1"/></pattern>
      <radialGradient id="g-hall" cx="50%" cy="46%" r="68%"><stop offset="0" stop-color="#1c3b86" stop-opacity="0.5"/><stop offset="0.7" stop-color="#0a1f55" stop-opacity="0.42"/><stop offset="1" stop-color="#030a22" stop-opacity="0.85"/></radialGradient>
      <radialGradient id="g-gold" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#e6c27a" stop-opacity="0.26"/><stop offset="1" stop-color="#e6c27a" stop-opacity="0"/></radialGradient>
      <radialGradient id="g-blue" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#6cb1ff" stop-opacity="0.2"/><stop offset="1" stop-color="#6cb1ff" stop-opacity="0"/></radialGradient>
      <linearGradient id="g-stage" ${stageGrad}><stop offset="0" stop-color="#5b8bff" stop-opacity="0.42"/><stop offset="0.55" stop-color="#1f3f9a" stop-opacity="0.3"/><stop offset="1" stop-color="#0b1f58" stop-opacity="0.5"/></linearGradient>
      <linearGradient id="g-chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#d9e2ef"/><stop offset="1" stop-color="#8c9ac0"/></linearGradient>
      <linearGradient id="g-rim" ${rimGrad}><stop offset="0" stop-color="#abc3e4" stop-opacity="0.25"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.95"/></linearGradient>
      <linearGradient id="g-cone" ${coneGrad}><stop offset="0" stop-color="#cfe0ff" stop-opacity="0.2"/><stop offset="1" stop-color="#cfe0ff" stop-opacity="0"/></linearGradient>
      <radialGradient id="g-vig" cx="50%" cy="50%" r="72%"><stop offset="0.62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.5"/></radialGradient>
      <clipPath id="c-dance"><rect x="${f(d.x)}" y="${f(d.y)}" width="${f(d.w)}" height="${f(d.h)}" rx="18"/></clipPath>
    </defs>
    <g class="hall__view" data-view>
      <rect class="hall__floor" x="${f(hl.x)}" y="${f(hl.y)}" width="${f(hl.w)}" height="${f(hl.h)}" rx="26" fill="url(#g-hall)"/>
      <rect x="${f(hl.x)}" y="${f(hl.y)}" width="${f(hl.w)}" height="${f(hl.h)}" rx="26" fill="url(#g-vig)" pointer-events="none"/>
      ${gold}
      ${blue}
      <rect class="hall__wall" x="${f(hl.x)}" y="${f(hl.y)}" width="${f(hl.w)}" height="${f(hl.h)}" rx="26"/>
      <rect class="hall__wall hall__wall--in" x="${f(hl.x + 8)}" y="${f(hl.y + 8)}" width="${f(hl.w - 16)}" height="${f(hl.h - 16)}" rx="19"/>
      ${windows}
      <rect class="hall__dance" x="${f(d.x)}" y="${f(d.y)}" width="${f(d.w)}" height="${f(d.h)}" rx="18" fill="url(#p-floor)"/>
      <g clip-path="url(#c-dance)">${cones}</g>
      <path class="hall__stage" d="${stagePath}" fill="url(#g-stage)" stroke="url(#g-rim)"/>
      <path class="hall__stage-edge" d="${edgePath}" stroke="url(#g-chrome)"/>
      <text class="hall__stage-t" x="${f(tx)}" y="${f(ty)}" fill="url(#g-chrome)" aria-hidden="true">${t.stage}</text>
      <g class="hall__door" aria-hidden="true">${door}</g>
      ${L.tables.map(tableMarkup).join('')}
    </g>
  </svg>`;
}

const legendMarkup = (): string => `
  <ul class="seats__zones">
    ${ZONES.map(
      (z) => `<li class="chip" style="--zc:${z.color}" title="${z.tables}"><i class="chip__dot" aria-hidden="true"></i><span class="chip__txt"><span class="chip__name">${z.name}</span><b class="chip__price">${rub(z.price)}</b></span></li>`,
    ).join('')}
  </ul>
  <ul class="seats__states" aria-label="Обозначения мест">
    <li><i class="cap cap--free" aria-hidden="true"></i>${t.legend.free}</li>
    <li><i class="cap cap--sel" aria-hidden="true"></i>${t.legend.selected}</li>
    <li><i class="cap cap--held" aria-hidden="true"></i>${t.legend.held}</li>
    <li><i class="cap cap--booked" aria-hidden="true"></i>${t.legend.booked}</li>
  </ul>
  <button type="button" class="seats__listbtn" data-openlist>${t.listBtn}</button>`;

const listMarkup = (cls = '', id = ''): string =>
  `<ul class="tlist${cls}"${id} aria-label="${t.listTitle}">${TABLES.map((tb) => {
    const z = zoneById(tb.zone);
    return `<li><button type="button" class="tlist__row" data-open="${tb.n}" style="--zc:${z.color}">
      <span class="tlist__no">${tb.n}</span>
      <span class="tlist__info"><span class="tlist__zone">${z.name}</span><span class="tlist__price">${rub(z.price)}</span></span>
      <span class="tlist__free" data-free="${tb.n}"></span>
    </button></li>`;
  }).join('')}</ul>`;

export function renderSeating(): string {
  layout = layoutFor(window.matchMedia('(min-width: 1024px)').matches ? 'h' : 'v');
  const ratio = (layout.viewBox.w / layout.viewBox.h).toFixed(4);
  return `
  <div class="container seats">
    <header class="seats__head sec-head">
      <h2 id="seats-title" class="chrome" data-split>${t.title}</h2>
      <p class="seats__lead seats__lead--fine">${typo(t.lead)}</p>
      <p class="seats__lead seats__lead--touch">${typo(t.leadTouch)}</p>
      <div class="seats__switch" role="group" aria-label="${t.viewAria}">
        <button type="button" class="seats__tab" data-view-btn="schema" aria-pressed="false">${t.viewSchema}</button>
        <button type="button" class="seats__tab" data-view-btn="3d" aria-pressed="false">${t.view3d}</button>
      </div>
    </header>
    <div class="seats__mapcol" style="--ratio:${ratio}" data-view="schema" data-mapcol>
      <div class="seats__map" data-map>
        <div class="hall-host" data-host>${svgMarkup(layout)}</div>
        <div class="seats__tip" data-tip role="tooltip" hidden></div>
        <div class="seats__zoom" role="group" aria-label="Масштаб схемы">
          <button type="button" class="zbtn" data-zoom="in" aria-label="${t.zoomIn}">+</button>
          <button type="button" class="zbtn" data-zoom="out" aria-label="${t.zoomOut}">−</button>
          <button type="button" class="zbtn zbtn--reset" data-zoom="reset" aria-label="${t.zoomReset}" hidden>1×</button>
        </div>
      </div>
      <figure class="seats__3d" data-3d hidden style="--r3d:${meta3d.ratio}">
        <div class="hall3d" data-hall3d>
          <div class="hall3d__plane" data-plane role="group" aria-label="${t.mapAria3d}">
            ${picture({ name: 'hall3d', variants: meta3d.variants.map((v) => ({ w: v.w, h: v.height })), fallback: 'webp', alt: '', sizes: '(min-width: 1024px) 560px, 100vw', cls: 'hall3d__img', eager: true })}
            ${HALL3D.map((h) => `<button type="button" class="hot" data-hot="${h.n}" style="left:${h.x * 100}%;top:${h.y * 100}%;width:${HALL3D_R * 200}%;--zc:${zoneById(tableByN(h.n).zone).color}" aria-label="Стол ${h.n}"><span class="hot__n" aria-hidden="true">${h.n}</span><span class="hot__sel" aria-hidden="true"></span></button>`).join('')}
          </div>
          <div class="seats__tip" data-tip3d role="tooltip" hidden></div>
        </div>
        <figcaption class="seats__cap3d">${t.caption3d}</figcaption>
      </figure>
      <div class="seats__legend">${legendMarkup()}</div>
      <section class="kids" aria-labelledby="kids-title">
        <div class="kids__row">
          <div class="kids__txt">
            <h3 class="kids__title" id="kids-title">${t.kidsTitle}</h3>
            <p class="kids__note">${t.kidsNote}</p>
          </div>
          <div class="kids__buy">
            <p class="kids__price"><b>${rub(CHILD_PRICE)}</b> ${t.kidsPerChild}</p>
            <div class="stepper kids__step" role="group" aria-label="${t.kidsStepper}">
              <button type="button" class="stepper__btn" data-kstep="-1" aria-label="Меньше: ${t.kidsStepper}">−</button>
              <output class="stepper__val" data-kcount aria-live="polite">0</output>
              <button type="button" class="stepper__btn" data-kstep="1" aria-label="Больше: ${t.kidsStepper}">+</button>
            </div>
          </div>
        </div>
        <ul class="kids__ages" data-ages></ul>
      </section>
    </div>
    <aside class="seats__panel glass" id="seats-panel" aria-label="${t.choiceTitle}" data-empty="true">
      <div class="panel__more">
        <ul class="panel__list" id="panel-list" data-list></ul>
        <button type="button" class="panel__clear" data-clear>${t.clear}</button>
      </div>
      <div class="panel__bar">
        <div class="panel__txt">
          <p class="panel__sum" data-sum aria-live="polite"></p>
          <p class="panel__note">${t.note}</p>
        </div>
        <div class="panel__row">
          <p class="panel__total" data-total></p>
          <button type="button" class="panel__toggle" data-toggle aria-expanded="false" aria-controls="panel-list">${t.compose}</button>
          <span class="btn-wrap"><button type="button" class="btn btn--primary" data-open-booking data-goal="seats_go"><span>${t.go}</span></button></span>
          <button type="button" class="panel__min" data-min aria-label="${t.minimize}"><span aria-hidden="true">×</span></button>
        </div>
      </div>
      <p class="panel__empty" data-emptytext>${t.empty}</p>
    </aside>
    <button type="button" class="seats__pill" id="seats-pill" data-pill aria-label="${t.pillOpen}" data-show="false">
      <span class="pill__txt" data-pilltxt></span>
      <svg class="pill__arrow" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>
    </button>
  </div>
  <dialog class="tcard tdlg glass" id="tables-dialog" aria-labelledby="tdlg-title">
    <div class="tcard__in">
      <h3 class="tcard__title" id="tdlg-title">${t.listTitle}</h3>
      ${listMarkup(' tlist--dlg')}
      <span class="btn-wrap"><button type="button" class="btn btn--primary" data-tclose><span>${t.listClose}</span></button></span>
    </div>
  </dialog>
  <dialog class="tcard glass" id="table-card" aria-labelledby="tcard-title"></dialog>`;
}

/* ---------- состояние и отрисовка ---------- */

let root: HTMLElement;
let host: HTMLElement;
let layout: Layout;
let svg: SVGSVGElement;
let panel: HTMLElement;
let pill: HTMLButtonElement;
let card: HTMLDialogElement;
let cardTable = 0;

const freeSeats = (n: number): number[] => Array.from({ length: SEATS_PER_TABLE }, (_, i) => i + 1).filter((s) => statusOf(seatKey(n, s)) === 'free');

function notify(): void {
  if (barMin) { barMin = false; storeBarMin(); }
  paint();
  listeners.forEach((fn) => fn());
}

function toggleSeat(n: number, s: number): void {
  const key = seatKey(n, s);
  if (statusOf(key) !== 'free') return;
  if (picks.has(key)) picks.delete(key);
  else if (picks.size < MAX_PICKS) picks.set(key, { table: n, seat: s });
  notify();
}

function toggleTable(n: number): void {
  const free = freeSeats(n);
  const all = free.length > 0 && free.every((s) => picks.has(seatKey(n, s)));
  for (const s of free) {
    if (all) picks.delete(seatKey(n, s));
    else if (!picks.has(seatKey(n, s)) && picks.size < MAX_PICKS) picks.set(seatKey(n, s), { table: n, seat: s });
  }
  notify();
}

function setKids(n: number): void {
  n = Math.max(0, Math.min(KIDS_MAX, n));
  while (kids.length > n) kids.pop();
  while (kids.length < n) kids.push(kids.length ? kids[kids.length - 1] : KID_AGE.byDefault);
  notify();
}

/** Счётчик и выпадающие списки возраста: список пересобирается, только когда меняется число детей. */
function paintKids(): void {
  root.querySelector<HTMLElement>('[data-kcount]')!.textContent = String(kids.length);
  root.querySelector<HTMLButtonElement>('[data-kstep="-1"]')!.disabled = kids.length <= 0;
  root.querySelector<HTMLButtonElement>('[data-kstep="1"]')!.disabled = kids.length >= KIDS_MAX;
  const ul = root.querySelector<HTMLElement>('[data-ages]')!;
  if (ul.children.length !== kids.length) {
    const opts = Array.from({ length: KID_AGE.max - KID_AGE.min + 1 }, (_, i) => KID_AGE.min + i);
    ul.innerHTML = kids
      .map(
        (_, i) => `<li class="kids__age"><label for="kid-age-${i}">Ребёнок ${i + 1}</label><select id="kid-age-${i}" class="input kids__select" data-age="${i}" aria-label="${t.kidsAge} ${i + 1}">${opts.map((a) => `<option value="${a}">${a} ${ageWord(a)}</option>`).join('')}</select></li>`,
      )
      .join('');
  }
  ul.querySelectorAll<HTMLSelectElement>('[data-age]').forEach((sel) => { sel.value = String(kids[Number(sel.dataset.age)]); });
}

function paint(): void {
  svg.querySelectorAll<SVGGElement>('.seat').forEach((el) => {
    const n = Number(el.dataset.t);
    const s = Number(el.dataset.s);
    const key = seatKey(n, s);
    const st = statusOf(key);
    const p = picks.get(key);
    el.classList.toggle('is-sel', !!p);
    el.classList.toggle('is-held', st === 'held');
    el.classList.toggle('is-booked', st === 'booked');
    const dot = el.querySelector<SVGRectElement>('.seat__cap')!;
    if (st === 'held' && !p) dot.style.fill = 'url(#seat-hatch)';
    else dot.style.removeProperty('fill');
    el.setAttribute('aria-pressed', String(!!p));
    el.setAttribute('aria-label', seatLabel(n, s));
    if (st === 'free') {
      el.setAttribute('tabindex', '0');
      el.removeAttribute('aria-disabled');
    } else {
      el.setAttribute('tabindex', '-1');
      el.setAttribute('aria-disabled', 'true');
    }
  });

  for (const tb of TABLES) {
    const free = freeSeats(tb.n);
    const sel = free.filter((s) => picks.has(seatKey(tb.n, s))).length;
    const all = free.length > 0 && sel === free.length;
    const z = zoneById(tb.zone);
    const g = svg.querySelector<SVGGElement>(`.tbl[data-table="${tb.n}"]`)!;
    g.classList.toggle('is-all', all);
    g.classList.toggle('is-full', free.length === 0);
    const hit = g.querySelector('.tbl__hit')!;
    hit.setAttribute(
      'aria-label',
      free.length === 0 ? `Стол ${tb.n}, мест нет` : `Стол ${tb.n}, ${all ? 'снять весь стол' : 'выбрать весь стол'}, свободно ${free.length} из ${SEATS_PER_TABLE}, ${rub(z.price)} за место`,
    );
    const txt = (sel ? `Выбрано ${sel} · ` : '') + (free.length === 0 ? 'Мест нет' : `Свободно ${free.length} из ${SEATS_PER_TABLE}`);
    root.querySelectorAll<HTMLElement>(`[data-free="${tb.n}"]`).forEach((row) => { row.textContent = txt; });
  }

  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-hot]')) {
    const n = Number(b.dataset.hot);
    const free = freeSeats(n);
    const sel = free.filter((x) => picks.has(seatKey(n, x))).length;
    const z = zoneById(tableByN(n).zone);
    b.classList.toggle('is-full', free.length === 0);
    b.classList.toggle('has-sel', sel > 0);
    b.dataset.sel = String(sel);
    b.setAttribute('aria-label', free.length === 0 ? `Стол ${n}, мест нет` : `Стол ${n}, ${rub(z.price)} за место, свободно ${free.length} из ${SEATS_PER_TABLE}${sel ? `, выбрано ${sel}` : ''}`);
    const badge = b.querySelector<HTMLElement>('.hot__sel');
    if (badge) badge.textContent = sel ? String(sel) : '';
  }
  paintKids();
  paintPanel();
  if (card.open) paintCard();
}

/* ---------- полоса итога: закреплена, пока есть выбор; сворачивается в «таблетку» ---------- */

const BAR_MIN_KEY = 'gnn-bar-min';
const PILL_PAD = 76;
let barMin = false;
let barInView = false;
try { barMin = sessionStorage.getItem(BAR_MIN_KEY) === '1'; } catch { /* sessionStorage недоступен */ }

function storeBarMin(): void {
  try {
    if (barMin) sessionStorage.setItem(BAR_MIN_KEY, '1');
    else sessionStorage.removeItem(BAR_MIN_KEY);
  } catch { /* sessionStorage недоступен */ }
}

function setBarMin(v: boolean): void {
  barMin = v;
  storeBarMin();
  syncBar();
}

function syncBarPad(): void {
  const pad = !hasSelection() ? 0 : barMin ? PILL_PAD : panel.offsetHeight;
  document.documentElement.style.setProperty('--bar-pad', pad + 'px');
}

function syncBar(): void {
  if (!panel || !pill) return;
  const empty = !hasSelection();
  const desktop = window.matchMedia('(min-width: 1024px)').matches;
  const showBar = empty ? barInView && desktop : !barMin;
  const showPill = !empty && barMin;
  panel.dataset.show = String(showBar);
  panel.inert = !showBar;
  pill.dataset.show = String(showPill);
  pill.inert = !showPill;
  pill.querySelector('[data-pilltxt]')!.textContent = `${t.pillLabel} · ${rub(totalPrice())}`;
  syncBarPad();
}

function paintPanel(): void {
  const list = getPicks();
  const empty = !hasSelection();
  panel.dataset.empty = String(empty);
  panel.querySelector('[data-sum]')!.textContent = [seatsText(), kidsText()].filter(Boolean).join(' · ');
  const counts = [list.length ? seatsWord(list.length) : '', kids.length ? `${kids.length} ${plural(kids.length, ['детский билет', 'детских билета', 'детских билетов'])}` : ''].filter(Boolean).join(' · ');
  panel.querySelector('[data-total]')!.innerHTML = empty ? '' : `<span>${t.total} · ${counts}</span><b>${rub(totalPrice())}</b>`;
  const ul = panel.querySelector<HTMLElement>('[data-list]')!;
  const seatRows = list.map((p) => {
    const key = seatKey(p.table, p.seat);
    return `<li class="prow" data-key="${key}">
        <span class="prow__name">Стол ${p.table}, место ${p.seat}<b>${rub(pickPrice(p))}</b></span>
        <button type="button" class="prow__x" data-del aria-label="${t.remove}: стол ${p.table}, место ${p.seat}"><span aria-hidden="true">×</span></button>
      </li>`;
  });
  const kidRows = kids.map(
    (age, i) => `<li class="prow" data-kid="${i}">
        <span class="prow__name">${t.kidsRow}, ${age} ${ageWord(age)}<b>${rub(CHILD_PRICE)}</b></span>
        <button type="button" class="prow__x" data-del aria-label="Убрать детский билет: ${age} ${ageWord(age)}"><span aria-hidden="true">×</span></button>
      </li>`,
  );
  ul.innerHTML = [...seatRows, ...kidRows].join('');
  if (empty) {
    panel.classList.remove('is-open');
    panel.querySelector('[data-toggle]')!.setAttribute('aria-expanded', 'false');
  }
  syncBar();
}

/* ---------- карточка стола (для телефона) ---------- */

function paintCard(): void {
  const tb = tableByN(cardTable);
  const z = zoneById(tb.zone);
  const free = freeSeats(tb.n);
  const chosen = free.filter((s) => picks.has(seatKey(tb.n, s))).length;
  const all = free.length > 0 && chosen === free.length;
  const chairs = Array.from({ length: SEATS_PER_TABLE }, (_, i) => {
    const s = i + 1;
    const key = seatKey(tb.n, s);
    const st = statusOf(key);
    const p = picks.get(key);
    const { rot } = seatPos(tb, s);
    const a = ((-90 + 22.5 + i * 45) * Math.PI) / 180;
    const cls = ['cseat', p ? 'is-sel' : '', st === 'held' ? 'is-held' : '', st === 'booked' ? 'is-booked' : ''].join(' ');
    return `<button type="button" class="${cls}" data-cs="${s}" style="left:${(50 + Math.cos(a) * 40).toFixed(2)}%;top:${(50 + Math.sin(a) * 40).toFixed(2)}%;--rot:${rot}deg" aria-pressed="${!!p}" aria-label="${seatLabel(tb.n, s)}"${st === 'free' ? '' : ' disabled'}><span class="cseat__n">${s}</span></button>`;
  }).join('');
  card.innerHTML = `
    <div class="tcard__in" style="--zc:${z.color}">
      <p class="label label--dot">${z.name}</p>
      <h3 class="tcard__title" id="tcard-title">Стол ${tb.n}</h3>
      <p class="tcard__meta">${rub(z.price)} за место</p>
      <p class="tcard__live" aria-live="polite"><b>свободно ${free.length} из ${SEATS_PER_TABLE}</b>${chosen ? ` · выбрано ${chosen}` : ''}</p>
      <div class="tcard__ring"><span class="tcard__table" aria-hidden="true">${tb.n}</span>${chairs}</div>
      <div class="tcard__actions">
        <span class="btn-wrap"><button type="button" class="btn btn--secondary" data-cardall${free.length === 0 ? ' disabled' : ''}><span>${all ? t.releaseTable : t.allTable}</span></button></span>
        <span class="btn-wrap"><button type="button" class="btn btn--primary" data-cardclose><span>${t.done}</span></button></span>
      </div>
    </div>`;
}

function openCard(n: number, focusSeat?: number): void {
  cardTable = n;
  paintCard();
  if (!card.open) {
    if (typeof card.showModal === 'function') card.showModal();
    else card.setAttribute('open', '');
  }
  const target = focusSeat ? card.querySelector<HTMLButtonElement>(`[data-cs="${focusSeat}"]:not([disabled])`) : null;
  (target ?? card.querySelector<HTMLButtonElement>('[data-cs]:not([disabled]), [data-cardclose]'))?.focus({ preventScroll: true });
}

const closeCard = (): void => {
  if (typeof card.close === 'function') card.close();
  else card.removeAttribute('open');
};

/* ---------- масштаб и перемещение ---------- */

function initView(map: HTMLElement): { chairPx: () => number; zoomed: () => boolean; reset: () => void } {
  const gEl = (): SVGGElement => svg.querySelector<SVGGElement>('[data-view]')!;
  const view = { s: 1, x: 0, y: 0 };
  const MAX = 4;
  let moved = false;

  const clamp = (): void => {
    view.x = Math.min(0, Math.max(layout.viewBox.w - layout.viewBox.w * view.s, view.x));
    view.y = Math.min(0, Math.max(layout.viewBox.h - layout.viewBox.h * view.s, view.y));
  };
  const apply = (): void => {
    gEl().setAttribute('transform', `translate(${view.x.toFixed(2)} ${view.y.toFixed(2)}) scale(${view.s.toFixed(3)})`);
    map.classList.toggle('is-zoomed', view.s > 1.01);
    map.querySelector<HTMLElement>('.zbtn--reset')!.hidden = view.s <= 1.01;
  };
  const unitsPerPx = (): number => layout.viewBox.w / svg.getBoundingClientRect().width;
  const zoomAt = (ns: number, cx: number, cy: number): void => {
    ns = Math.min(MAX, Math.max(1, ns));
    const r = ns / view.s;
    view.x = cx - (cx - view.x) * r;
    view.y = cy - (cy - view.y) * r;
    view.s = ns;
    clamp();
    apply();
  };

  map.querySelectorAll<HTMLButtonElement>('[data-zoom]').forEach((b) =>
    b.addEventListener('click', () => {
      const a = b.dataset.zoom;
      if (a === 'reset') { view.s = 1; view.x = 0; view.y = 0; apply(); return; }
      zoomAt(view.s * (a === 'in' ? 1.5 : 1 / 1.5), layout.viewBox.w / 2, layout.viewBox.h / 2);
    }),
  );

  // Пальцы: два касания масштабируют, один (при масштабе > 1) двигает. При масштабе 1 один палец скроллит страницу.
  let pinch: { d: number; s: number; x: number; y: number; mx: number; my: number } | null = null;
  let pan: { x: number; y: number } | null = null;
  const dist = (e: TouchEvent): number => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  const mid = (e: TouchEvent): { x: number; y: number } => ({ x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 });
  const toUnits = (cx: number, cy: number): { x: number; y: number } => {
    const r = svg.getBoundingClientRect();
    const k = unitsPerPx();
    return { x: (cx - r.left) * k, y: (cy - r.top) * k };
  };

  map.addEventListener('touchstart', (e) => {
    moved = false;
    if (e.touches.length === 2) {
      const m = toUnits(mid(e).x, mid(e).y);
      pinch = { d: dist(e), s: view.s, x: view.x, y: view.y, mx: m.x, my: m.y };
      pan = null;
    } else if (e.touches.length === 1 && view.s > 1.01) {
      pan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, { passive: true });

  map.addEventListener('touchmove', (e) => {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      moved = true;
      const ns = Math.min(MAX, Math.max(1, (pinch.s * dist(e)) / pinch.d));
      const m = toUnits(mid(e).x, mid(e).y);
      const wx = (pinch.mx - pinch.x) / pinch.s;
      const wy = (pinch.my - pinch.y) / pinch.s;
      view.s = ns;
      view.x = m.x - wx * ns;
      view.y = m.y - wy * ns;
      clamp();
      apply();
    } else if (pan && e.touches.length === 1 && view.s > 1.01) {
      e.preventDefault();
      const k = unitsPerPx();
      const tc = e.touches[0];
      if (Math.abs(tc.clientX - pan.x) + Math.abs(tc.clientY - pan.y) > 3) moved = true;
      view.x += (tc.clientX - pan.x) * k;
      view.y += (tc.clientY - pan.y) * k;
      pan = { x: tc.clientX, y: tc.clientY };
      clamp();
      apply();
    }
  }, { passive: false });

  map.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pinch = null;
    if (e.touches.length === 0) pan = null;
    else if (e.touches.length === 1 && view.s > 1.01) pan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    window.setTimeout(() => { moved = false; }, 60);
  }, { passive: true });

  // Мышь: перетаскивание при масштабе > 1
  let drag: { x: number; y: number } | null = null;
  map.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || view.s <= 1.01 || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY };
    moved = false;
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = unitsPerPx();
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) moved = true;
    view.x += (e.clientX - drag.x) * k;
    view.y += (e.clientY - drag.y) * k;
    drag = { x: e.clientX, y: e.clientY };
    clamp();
    apply();
  });
  window.addEventListener('pointerup', () => {
    drag = null;
    window.setTimeout(() => { moved = false; }, 60);
  });
  map.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);

  return {
    chairPx: () => (GEOM.seatHit * 2 * view.s * svg.getBoundingClientRect().width) / layout.viewBox.w,
    zoomed: () => view.s > 1.01,
    reset: () => {
      view.s = 1;
      view.x = 0;
      view.y = 0;
      apply();
    },
  };
}

/* ---------- инициализация ---------- */

export function initSeating(): void {
  const el = document.querySelector<HTMLElement>('#seats');
  if (!el) return;
  root = el;
  host = el.querySelector<HTMLElement>('[data-host]')!;
  svg = host.querySelector<SVGSVGElement>('svg')!;
  panel = el.querySelector<HTMLElement>('#seats-panel')!;
  pill = el.querySelector<HTMLButtonElement>('#seats-pill')!;
  card = el.querySelector<HTMLDialogElement>('#table-card')!;
  const map = el.querySelector<HTMLElement>('[data-map]')!;
  const view = initView(map);

  // Переключатель «Схема | 3D-вид»: по умолчанию схема везде, 3D-вид по переключателю; выбор общий (одно состояние)
  const mapcol = el.querySelector<HTMLElement>('[data-mapcol]')!;
  const box3d = el.querySelector<HTMLElement>('[data-3d]')!;
  const setView = (v: 'schema' | '3d'): void => {
    mapcol.dataset.view = v;
    box3d.hidden = v !== '3d';
    map.hidden = v !== 'schema';
    el.querySelectorAll<HTMLButtonElement>('[data-view-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.viewBtn === v)));
    if (v === '3d') view.reset();
    el.querySelector<HTMLElement>('.seats__lead--fine')!.dataset.view = v;
  };
  el.querySelectorAll<HTMLButtonElement>('[data-view-btn]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.viewBtn as 'schema' | '3d')));
  setView('schema');

  // 3D: клик по зоне стола открывает ту же карточку с местами, наведение показывает подсказку
  const hall3d = el.querySelector<HTMLElement>('[data-hall3d]')!;
  const tip3d = el.querySelector<HTMLElement>('[data-tip3d]')!;
  const showTip3d = (btn: HTMLElement): void => {
    const n = Number(btn.dataset.hot);
    const z = zoneById(tableByN(n).zone);
    const free = freeSeats(n).length;
    tip3d.textContent = `Стол ${n} · ${rub(z.price)} · ${free === 0 ? 'мест нет' : `свободно ${free} из ${SEATS_PER_TABLE}`}`;
    tip3d.hidden = false;
    const hb = hall3d.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    tip3d.style.maxWidth = `${Math.max(120, hb.width - 16)}px`;
    const tw = tip3d.offsetWidth;
    tip3d.style.left = `${Math.max(8, Math.min(b.left + b.width / 2 - hb.left - tw / 2, hb.width - tw - 8))}px`;
    const above = b.top - hb.top > 56;
    tip3d.style.top = `${above ? b.top - hb.top - tip3d.offsetHeight - 8 : b.bottom - hb.top + 8}px`;
  };
  const hideTip3d = (): void => { tip3d.hidden = true; };
  hall3d.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-hot]');
    if (b) openCard(Number(b.dataset.hot));
  });
  hall3d.addEventListener('pointerover', (e) => {
    if ((e as PointerEvent).pointerType !== 'mouse') return;
    const b = (e.target as Element).closest<HTMLElement>('[data-hot]');
    if (b) showTip3d(b); else hideTip3d();
  });
  hall3d.addEventListener('pointerleave', hideTip3d);
  hall3d.addEventListener('focusin', (e) => { const b = (e.target as Element).closest<HTMLElement>('[data-hot]'); if (b) showTip3d(b); });
  hall3d.addEventListener('focusout', hideTip3d);

  // Лёгкий наклон ±4°: от мыши на десктопе, от прокрутки на телефоне; при prefers-reduced-motion без движения
  const plane = hall3d.querySelector<HTMLElement>('[data-plane]')!;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  let raf = 0;
  const tilt = (rx: number, ry: number): void => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      plane.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
      plane.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
    });
  };
  hall3d.addEventListener('pointermove', (e) => {
    if (still.matches || !fine.matches || (e as PointerEvent).pointerType !== 'mouse') return;
    const r = hall3d.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
    tilt(-ny * 4, nx * 4);
  });
  hall3d.addEventListener('pointerleave', () => { if (!still.matches && fine.matches) tilt(0, 0); });
  const onScroll = (): void => {
    if (still.matches || fine.matches || box3d.hidden) return;
    const r = hall3d.getBoundingClientRect();
    const k = Math.max(-1, Math.min(1, ((r.top + r.height / 2) / window.innerHeight - 0.5) * 2));
    tilt(k * 4, 0);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // Десктоп (≥1024px): зал горизонтально, сцена сверху; ниже — вертикально. При смене ширины схема собирается заново.
  const wide = window.matchMedia('(min-width: 1024px)');
  wide.addEventListener('change', () => {
    layout = layoutFor(wide.matches ? 'h' : 'v');
    host.innerHTML = svgMarkup(layout);
    svg = host.querySelector<SVGSVGElement>('svg')!;
    el.querySelector<HTMLElement>('.seats__mapcol')!.style.setProperty('--ratio', (layout.viewBox.w / layout.viewBox.h).toFixed(4));
    view.reset();
    paint();
  });

  const coarse = window.matchMedia('(pointer: coarse)');
  const touchMode = (): boolean => coarse.matches || window.innerWidth < 900;

  const seatAction = (n: number, s: number, kbd: boolean): void => {
    if (statusOf(seatKey(n, s)) !== 'free') return;
    // Крупно открываем карточку, если стул на экране меньше 32 px (телефон без приближения)
    if (!kbd && touchMode() && view.chairPx() < 32) openCard(n, s);
    else toggleSeat(n, s);
  };
  const tableAction = (n: number, kbd: boolean): void => {
    if (!kbd && touchMode()) openCard(n);
    else if (freeSeats(n).length > 0) toggleTable(n);
  };

  host.addEventListener('click', (e) => {
    const target = e.target as Element;
    const seat = target.closest<SVGGElement>('.seat');
    if (seat) { seatAction(Number(seat.dataset.t), Number(seat.dataset.s), e.detail === 0); return; }
    const hit = target.closest<SVGElement>('[data-hit]');
    if (hit) tableAction(Number(hit.dataset.hit), e.detail === 0);
  });
  host.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = (e.target as Element).closest<SVGElement>('[role="button"]');
    if (!target) return;
    e.preventDefault();
    const seat = target.closest<SVGGElement>('.seat');
    if (seat) seatAction(Number(seat.dataset.t), Number(seat.dataset.s), true);
    else if (target.dataset.hit) tableAction(Number(target.dataset.hit), true);
  });

  // Список столов: на телефоне под схемой, на десктопе компактный диалог поверх
  const tdlg = el.querySelector<HTMLDialogElement>('#tables-dialog')!;
  el.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-open]');
    if (!b) return;
    if (tdlg.open) tdlg.close();
    openCard(Number(b.dataset.open));
  });
  el.querySelector('[data-openlist]')!.addEventListener('click', () => {
    if (typeof tdlg.showModal === 'function') tdlg.showModal();
    else tdlg.setAttribute('open', '');
  });
  tdlg.addEventListener('click', (e) => {
    const target = e.target as Element;
    if (target === tdlg || target.closest('[data-tclose]')) tdlg.close();
  });

  card.addEventListener('click', (e) => {
    const target = e.target as Element;
    if (target === card) { closeCard(); return; }
    const cs = target.closest<HTMLButtonElement>('[data-cs]');
    if (cs) { toggleSeat(cardTable, Number(cs.dataset.cs)); card.querySelector<HTMLButtonElement>(`[data-cs="${cs.dataset.cs}"]`)?.focus({ preventScroll: true }); return; }
    if (target.closest('[data-cardall]')) { toggleTable(cardTable); return; }
    if (target.closest('[data-cardclose]')) closeCard();
  });

  panel.addEventListener('click', (e) => {
    const target = e.target as Element;
    const row = target.closest<HTMLElement>('.prow');
    if (row && target.closest('[data-del]')) {
      if (row.dataset.kid !== undefined) kids.splice(Number(row.dataset.kid), 1);
      else picks.delete(row.dataset.key!);
      notify();
      return;
    }
    if (target.closest('[data-clear]')) { picks.clear(); kids.length = 0; notify(); return; }
    const tg = target.closest<HTMLElement>('[data-toggle]');
    if (tg) {
      const open = panel.classList.toggle('is-open');
      tg.setAttribute('aria-expanded', String(open));
    }
  });

  // Детские билеты: степпер и возраст каждого ребёнка
  el.querySelectorAll<HTMLButtonElement>('[data-kstep]').forEach((b) => b.addEventListener('click', () => setKids(kids.length + Number(b.dataset.kstep))));
  el.querySelector('[data-ages]')!.addEventListener('change', (e) => {
    const sel = (e.target as Element).closest<HTMLSelectElement>('[data-age]');
    if (!sel) return;
    kids[Number(sel.dataset.age)] = Number(sel.value);
    notify();
  });

  // Пустая полоса видна только в блоке #seats (десктоп); с выбором закреплена на всём сайте
  new IntersectionObserver(([entry]) => { barInView = entry.isIntersecting; syncBar(); }, { threshold: 0 }).observe(el);
  new ResizeObserver(syncBarPad).observe(panel);
  window.matchMedia('(min-width: 1024px)').addEventListener('change', syncBar);
  panel.querySelector('[data-min]')!.addEventListener('click', () => setBarMin(true));
  pill.addEventListener('click', () => { setBarMin(false); panel.querySelector<HTMLElement>('[data-min]')!.focus({ preventScroll: true }); });
  syncBar();

  // Подсказка над столом: мышь и клавиатурный фокус
  const tip = el.querySelector<HTMLElement>('[data-tip]')!;
  const showTip = (n: number): void => {
    const tb = tableByN(n);
    const z = zoneById(tb.zone);
    const free = freeSeats(n).length;
    tip.textContent = `Стол ${n} · ${z.name} · ${rub(z.price)} · ${free === 0 ? 'мест нет' : `свободно ${free} из ${SEATS_PER_TABLE}`}`;
    tip.hidden = false;
    const m = map.getBoundingClientRect();
    tip.style.maxWidth = `${Math.max(120, m.width - 16)}px`;
    const b = svg.querySelector<SVGElement>(`.tbl[data-table="${n}"] .tbl__body`)!.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const left = Math.max(8, Math.min(b.left + b.width / 2 - m.left - tw / 2, m.width - tw - 8));
    const above = b.top - m.top > 64;
    tip.style.left = `${left}px`;
    tip.style.top = `${above ? b.top - m.top - tip.offsetHeight - 22 : b.bottom - m.top + 22}px`;
  };
  const hideTip = (): void => { tip.hidden = true; };
  host.addEventListener('pointerover', (e) => {
    if ((e as PointerEvent).pointerType !== 'mouse') return;
    const g = (e.target as Element).closest<SVGGElement>('.tbl');
    if (g) showTip(Number(g.dataset.table));
    else hideTip();
  });
  host.addEventListener('pointerleave', hideTip);
  host.addEventListener('focusin', (e) => {
    const g = (e.target as Element).closest<SVGGElement>('.tbl');
    if (g) showTip(Number(g.dataset.table));
  });
  host.addEventListener('focusout', hideTip);

  paint();

  // Статусы мест: статический файл, позже адрес функции (SEATING_STATUS_URL)
  fetch(SEATING_STATUS_URL, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { seats?: Record<string, string> } | null) => {
      if (!data?.seats) return;
      status.clear();
      for (const [k, v] of Object.entries(data.seats)) if (v === 'held' || v === 'booked') status.set(k, v);
      for (const k of [...picks.keys()]) if (statusOf(k) !== 'free') picks.delete(k);
      notify();
    })
    .catch(() => undefined);
}

export { CHILD_PRICE };
