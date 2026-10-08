import { prices, seating as t, typo } from '../../content/content';
import {
  CHILD_PRICE,
  GEOM,
  HALL,
  SEATING_STATUS_URL,
  SEATS_PER_TABLE,
  STAGE,
  TABLES,
  VIEWBOX,
  ZONES,
  seatKey,
  seatPos,
  seatPrice,
  tableByN,
  zoneById,
  type HallTable,
  type SeatKind,
  type SeatStatus,
} from '../../data/seating';

/**
 * Блок «Выберите места» (#seats): SVG-схема зала, выбор мест, панель итога, карточка стола для телефона,
 * pinch/pan + кнопки масштаба, список столов. Состояние выбора отдаётся форме брони через onSelectionChange.
 */

export interface Pick {
  table: number;
  seat: number;
  kind: SeatKind;
}

const picks = new Map<string, Pick>();
const status = new Map<string, SeatStatus>();
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
export const pickPrice = (p: Pick): number => seatPrice(p.table, p.kind);
export const totalPrice = (): number => getPicks().reduce((s, p) => s + pickPrice(p), 0);

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

const stateWord = (p: Pick | undefined, st: SeatStatus): string =>
  p ? (p.kind === 'child' ? 'выбрано, детское место' : 'выбрано') : st === 'held' ? 'удержано' : st === 'booked' ? 'занято' : 'свободно';

const seatLabel = (n: number, s: number): string => {
  const key = seatKey(n, s);
  const p = picks.get(key);
  const price = p ? pickPrice(p) : seatPrice(n, 'adult');
  return `Стол ${n}, место ${s}, ${rub(price)}, ${stateWord(p, statusOf(key))}`;
};

function tableMarkup(tb: HallTable): string {
  const z = zoneById(tb.zone);
  const chairs = Array.from({ length: SEATS_PER_TABLE }, (_, i) => {
    const s = i + 1;
    const { x, y } = seatPos(tb, s);
    return `<g class="seat" role="button" tabindex="0" data-t="${tb.n}" data-s="${s}" aria-pressed="false" aria-label="${seatLabel(tb.n, s)}">
      <circle class="seat__hit" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${GEOM.seatHit}"/>
      <circle class="seat__dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${GEOM.seat}"/>
    </g>`;
  }).join('');
  return `<g class="tbl" data-table="${tb.n}" style="--zc:${z.color}">
    <circle class="tbl__body" cx="${tb.x}" cy="${tb.y}" r="${GEOM.table}"/>
    <circle class="tbl__hit" cx="${tb.x}" cy="${tb.y}" r="${GEOM.tableHit}" role="button" tabindex="0" data-hit="${tb.n}" aria-label="Стол ${tb.n}"/>
    <text class="tbl__no" x="${tb.x}" y="${tb.y}" aria-hidden="true">${tb.n}</text>
    ${chairs}
  </g>`;
}

function svgMarkup(): string {
  const stageCx = STAGE.x + STAGE.w / 2;
  const stageCy = STAGE.y + STAGE.h / 2;
  return `<svg class="hall" viewBox="0 0 ${VIEWBOX.w} ${VIEWBOX.h}" role="group" aria-label="${t.mapAria}" data-svg>
    <defs>
      <pattern id="seat-hatch" width="4.5" height="4.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="4.5" height="4.5" fill="#2b2a18"/>
        <line x1="0" y1="0" x2="0" y2="4.5" stroke="#f4d24e" stroke-width="2.2"/>
      </pattern>
    </defs>
    <g class="hall__view" data-view>
      <rect class="hall__wall" x="${HALL.x.toFixed(1)}" y="${HALL.y.toFixed(1)}" width="${HALL.w.toFixed(1)}" height="${HALL.h.toFixed(1)}" rx="6"/>
      <rect class="hall__stage" x="${STAGE.x.toFixed(1)}" y="${STAGE.y.toFixed(1)}" width="${STAGE.w.toFixed(1)}" height="${STAGE.h.toFixed(1)}" rx="4"/>
      <text class="hall__stage-t" x="${stageCx.toFixed(1)}" y="${stageCy.toFixed(1)}" aria-hidden="true">${t.stage}</text>
      ${TABLES.map(tableMarkup).join('')}
    </g>
  </svg>`;
}

const legendMarkup = (): string => `
  <ul class="seats__zones">
    ${ZONES.map(
      (z) => `<li class="zone" style="--zc:${z.color}"><i class="zone__dot" aria-hidden="true"></i><span class="zone__name">${z.name}</span><span class="zone__tables">${z.tables}</span><b class="zone__price">${rub(z.price)}</b></li>`,
    ).join('')}
    <li class="zone zone--child"><span>${t.childLine}</span></li>
  </ul>
  <ul class="seats__states" aria-label="Обозначения мест">
    <li><i class="st st--free" aria-hidden="true"></i>${t.legend.free}</li>
    <li><i class="st st--sel" aria-hidden="true"></i>${t.legend.selected}</li>
    <li><i class="st st--held" aria-hidden="true"></i>${t.legend.held}</li>
    <li><i class="st st--booked" aria-hidden="true"></i>${t.legend.booked}</li>
  </ul>`;

const listMarkup = (): string =>
  `<ul class="tlist" id="seats-list" aria-label="${t.listTitle}">${TABLES.map((tb) => {
    const z = zoneById(tb.zone);
    return `<li><button type="button" class="tlist__row" data-open="${tb.n}" style="--zc:${z.color}">
      <span class="tlist__no">${tb.n}</span>
      <span class="tlist__info"><span class="tlist__zone">${z.name}</span><span class="tlist__price">${rub(z.price)}</span></span>
      <span class="tlist__free" data-free="${tb.n}"></span>
    </button></li>`;
  }).join('')}</ul>`;

export function renderSeating(): string {
  return `
  <div class="container seats">
    <header class="seats__head">
      <h2 id="seats-title" class="chrome" data-split>${t.title}</h2>
      <p class="seats__lead seats__lead--fine">${typo(t.lead)}</p>
      <p class="seats__lead seats__lead--touch">${typo(t.leadTouch)}</p>
      <a class="seats__skip" href="#seats-list">${t.skip}</a>
    </header>
    <div class="seats__grid">
      <div class="seats__mapcol">
        <div class="seats__map" data-map>
          ${svgMarkup()}
          <div class="seats__zoom" role="group" aria-label="Масштаб схемы">
            <button type="button" class="zbtn" data-zoom="in" aria-label="${t.zoomIn}">+</button>
            <button type="button" class="zbtn" data-zoom="out" aria-label="${t.zoomOut}">−</button>
            <button type="button" class="zbtn zbtn--reset" data-zoom="reset" aria-label="${t.zoomReset}" hidden>1×</button>
          </div>
        </div>
        ${legendMarkup()}
      </div>
      <div class="seats__side">
        <aside class="seats__panel glass" id="seats-panel" aria-label="${t.choiceTitle}" data-empty="true">
          <div class="panel__bar">
            <p class="panel__sum" data-sum aria-live="polite"></p>
            <div class="panel__row">
              <p class="panel__total" data-total></p>
              <button type="button" class="panel__toggle" data-toggle aria-expanded="false" aria-controls="panel-list">${t.compose}</button>
              <span class="btn-wrap"><a class="btn btn--primary" href="#booking" data-goal="seats_go"><span>${t.go}</span></a></span>
            </div>
          </div>
          <p class="panel__empty" data-emptytext>${t.empty}</p>
          <ul class="panel__list" id="panel-list" data-list></ul>
          <p class="panel__note">${t.note}</p>
          <button type="button" class="panel__clear" data-clear>${t.clear}</button>
        </aside>
        ${listMarkup()}
      </div>
    </div>
  </div>
  <dialog class="tcard glass" id="table-card" aria-labelledby="tcard-title"></dialog>`;
}

/* ---------- состояние и отрисовка ---------- */

let root: HTMLElement;
let svg: SVGSVGElement;
let panel: HTMLElement;
let card: HTMLDialogElement;
let cardTable = 0;

const freeSeats = (n: number): number[] => Array.from({ length: SEATS_PER_TABLE }, (_, i) => i + 1).filter((s) => statusOf(seatKey(n, s)) === 'free');

function notify(): void {
  paint();
  listeners.forEach((fn) => fn());
}

function toggleSeat(n: number, s: number): void {
  const key = seatKey(n, s);
  if (statusOf(key) !== 'free') return;
  if (picks.has(key)) picks.delete(key);
  else if (picks.size < MAX_PICKS) picks.set(key, { table: n, seat: s, kind: 'adult' });
  notify();
}

function toggleTable(n: number): void {
  const free = freeSeats(n);
  const all = free.length > 0 && free.every((s) => picks.has(seatKey(n, s)));
  for (const s of free) {
    if (all) picks.delete(seatKey(n, s));
    else if (!picks.has(seatKey(n, s)) && picks.size < MAX_PICKS) picks.set(seatKey(n, s), { table: n, seat: s, kind: 'adult' });
  }
  notify();
}

function setKind(key: string, kind: SeatKind): void {
  const p = picks.get(key);
  if (!p) return;
  p.kind = kind;
  notify();
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
    const dot = el.querySelector<SVGCircleElement>('.seat__dot')!;
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
    const row = root.querySelector<HTMLElement>(`[data-free="${tb.n}"]`);
    if (row) row.textContent = (sel ? `Выбрано ${sel} · ` : '') + (free.length === 0 ? 'Мест нет' : `Свободно ${free.length} из ${SEATS_PER_TABLE}`);
  }

  paintPanel();
  if (card.open) paintCard();
}

function paintPanel(): void {
  const list = getPicks();
  const total = totalPrice();
  const empty = list.length === 0;
  panel.dataset.empty = String(empty);
  panel.querySelector('[data-sum]')!.textContent = empty ? '' : selectionText();
  panel.querySelector('[data-total]')!.innerHTML = empty ? '' : `<span>${seatsWord(list.length)}</span><b>${rub(total)}</b>`;
  const ul = panel.querySelector<HTMLElement>('[data-list]')!;
  ul.innerHTML = list
    .map((p) => {
      const key = seatKey(p.table, p.seat);
      return `<li class="prow" data-key="${key}">
        <span class="prow__name">Стол ${p.table}, место ${p.seat}<b>${rub(pickPrice(p))}</b></span>
        <span class="seg2" role="group" aria-label="Тип места: стол ${p.table}, место ${p.seat}">
          <button type="button" class="seg2__b" data-kind="adult" aria-pressed="${p.kind === 'adult'}">${t.adult}</button>
          <button type="button" class="seg2__b" data-kind="child" aria-pressed="${p.kind === 'child'}">${t.child}</button>
        </span>
        <button type="button" class="prow__x" data-del aria-label="${t.remove}: стол ${p.table}, место ${p.seat}"><span aria-hidden="true">×</span></button>
      </li>`;
    })
    .join('');
  if (empty) {
    panel.classList.remove('is-open');
    panel.querySelector('[data-toggle]')!.setAttribute('aria-expanded', 'false');
  }
}

/* ---------- карточка стола (для телефона) ---------- */

function paintCard(): void {
  const tb = tableByN(cardTable);
  const z = zoneById(tb.zone);
  const free = freeSeats(tb.n);
  const all = free.length > 0 && free.every((s) => picks.has(seatKey(tb.n, s)));
  const chairs = Array.from({ length: SEATS_PER_TABLE }, (_, i) => {
    const s = i + 1;
    const key = seatKey(tb.n, s);
    const st = statusOf(key);
    const p = picks.get(key);
    const a = ((-90 + 22.5 + i * 45) * Math.PI) / 180;
    const cls = ['cseat', p ? 'is-sel' : '', st === 'held' ? 'is-held' : '', st === 'booked' ? 'is-booked' : ''].join(' ');
    return `<button type="button" class="${cls}" data-cs="${s}" style="left:${(50 + Math.cos(a) * 39).toFixed(2)}%;top:${(50 + Math.sin(a) * 39).toFixed(2)}%" aria-pressed="${!!p}" aria-label="${seatLabel(tb.n, s)}"${st === 'free' ? '' : ' disabled'}>${s}</button>`;
  }).join('');
  card.innerHTML = `
    <div class="tcard__in" style="--zc:${z.color}">
      <p class="label label--dot">${z.name}</p>
      <h3 class="tcard__title" id="tcard-title">Стол ${tb.n}</h3>
      <p class="tcard__meta">${rub(z.price)} за место · свободно ${free.length} из ${SEATS_PER_TABLE}</p>
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

function initView(map: HTMLElement): { chairPx: () => number; zoomed: () => boolean } {
  const g = svg.querySelector<SVGGElement>('[data-view]')!;
  const view = { s: 1, x: 0, y: 0 };
  const MAX = 4;
  let moved = false;

  const clamp = (): void => {
    view.x = Math.min(0, Math.max(VIEWBOX.w - VIEWBOX.w * view.s, view.x));
    view.y = Math.min(0, Math.max(VIEWBOX.h - VIEWBOX.h * view.s, view.y));
  };
  const apply = (): void => {
    g.setAttribute('transform', `translate(${view.x.toFixed(2)} ${view.y.toFixed(2)}) scale(${view.s.toFixed(3)})`);
    map.classList.toggle('is-zoomed', view.s > 1.01);
    map.querySelector<HTMLElement>('.zbtn--reset')!.hidden = view.s <= 1.01;
  };
  const unitsPerPx = (): number => VIEWBOX.w / svg.getBoundingClientRect().width;
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
      zoomAt(view.s * (a === 'in' ? 1.5 : 1 / 1.5), VIEWBOX.w / 2, VIEWBOX.h / 2);
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
    chairPx: () => (GEOM.seatHit * 2 * view.s * svg.getBoundingClientRect().width) / VIEWBOX.w,
    zoomed: () => view.s > 1.01,
  };
}

/* ---------- инициализация ---------- */

export function initSeating(): void {
  const el = document.querySelector<HTMLElement>('#seats');
  if (!el) return;
  root = el;
  svg = el.querySelector<SVGSVGElement>('[data-svg]')!;
  panel = el.querySelector<HTMLElement>('#seats-panel')!;
  card = el.querySelector<HTMLDialogElement>('#table-card')!;
  const map = el.querySelector<HTMLElement>('[data-map]')!;
  const view = initView(map);

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

  svg.addEventListener('click', (e) => {
    const target = e.target as Element;
    const seat = target.closest<SVGGElement>('.seat');
    if (seat) { seatAction(Number(seat.dataset.t), Number(seat.dataset.s), e.detail === 0); return; }
    const hit = target.closest<SVGElement>('[data-hit]');
    if (hit) tableAction(Number(hit.dataset.hit), e.detail === 0);
  });
  svg.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = (e.target as Element).closest<SVGElement>('[role="button"]');
    if (!target) return;
    e.preventDefault();
    const seat = target.closest<SVGGElement>('.seat');
    if (seat) seatAction(Number(seat.dataset.t), Number(seat.dataset.s), true);
    else if (target.dataset.hit) tableAction(Number(target.dataset.hit), true);
  });

  el.querySelector('.tlist')!.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-open]');
    if (b) openCard(Number(b.dataset.open));
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
    const kind = target.closest<HTMLElement>('[data-kind]');
    if (row && kind) { setKind(row.dataset.key!, kind.dataset.kind as SeatKind); return; }
    if (row && target.closest('[data-del]')) { picks.delete(row.dataset.key!); notify(); return; }
    if (target.closest('[data-clear]')) { picks.clear(); notify(); return; }
    const tg = target.closest<HTMLElement>('[data-toggle]');
    if (tg) {
      const open = panel.classList.toggle('is-open');
      tg.setAttribute('aria-expanded', String(open));
    }
  });

  // На телефоне панель закреплена снизу, пока блок схемы в кадре
  new IntersectionObserver(([entry]) => { panel.dataset.inview = String(entry.isIntersecting); }, { threshold: 0 }).observe(el);
  // ...и прячется, когда в кадре форма брони (она показывает тот же выбор)
  const booking = document.querySelector('#booking');
  if (booking) new IntersectionObserver(([entry]) => { panel.dataset.formview = String(entry.isIntersecting); }, { threshold: 0 }).observe(booking);

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
