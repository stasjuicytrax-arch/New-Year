import { booking, bookingBlock, event, phones, prices, seating, typo } from '../../content/content';
import { getPicks, onSelectionChange, pickPrice, selectionText, totalPrice } from './seating';

/**
 * Финальный CTA + форма брони (TZ §5.6): цены двумя билетами, форма со степперами, выбор горячего,
 * ориентировочный расчёт, валидация на клиенте. Заявка уходит на booking.endpoint (Telegram-бот через serverless);
 * пока канал не подключён, форма честно говорит об этом и показывает телефоны (успех не имитируется).
 */

const fmt = (n: number): string => new Intl.NumberFormat('ru-RU').format(n).replace(/\s/g, ' ');

interface StepperCfg {
  name: string;
  label: string;
  min: number;
  max: number;
  value: number;
  hint?: string;
}

const stepper = (c: StepperCfg): string => `
  <div class="field field--step" data-step="${c.name}" data-min="${c.min}" data-max="${c.max}">
    <span class="field__label" id="lb-${c.name}">${c.label}${c.hint ? ` <small>${c.hint}</small>` : ''}</span>
    <div class="stepper" role="group" aria-labelledby="lb-${c.name}">
      <button type="button" class="stepper__btn" data-dir="-1" aria-label="Меньше: ${c.label}">−</button>
      <output class="stepper__val" data-val aria-live="polite">${c.value}</output>
      <button type="button" class="stepper__btn" data-dir="1" aria-label="Больше: ${c.label}">+</button>
    </div>
    <input type="hidden" name="${c.name}" value="${c.value}">
  </div>`;

export function renderBooking(): string {
  const [adult, child] = bookingBlock.tickets;
  const tickets = [adult, child]
    .map(
      (t) => `
      <div class="price-ticket glass" data-ticket>
        <span class="label">${t.label}</span>
        <span class="price-ticket__value chrome">${t.prefix ? `<small>${t.prefix}</small> ` : ''}<span data-count="${t.value}" data-sep="1">${fmt(t.value)}</span> <small>${prices.currency}</small></span>
        ${t.note ? `<span class="price-ticket__note">${t.note}</span>` : ''}
      </div>`,
    )
    .join('');

  return `
  <div class="container booking__grid">
    <div class="booking__lead">
      <h2 id="booking-title" class="chrome" data-split>${typo(bookingBlock.title)}</h2>
      <p class="booking__text" data-fade>${typo(bookingBlock.text)}</p>
      <p class="booking__cta" data-fade>${bookingBlock.cta}</p>
      <p class="booking__priceline" data-fade>${typo(bookingBlock.priceLine)}</p>
      <div class="booking__tickets" data-cascade>${tickets}</div>
      <p class="booking__call" data-fade>${bookingBlock.callLine} ${phones
        .map((p) => `<a href="${p.href}" data-goal="${p.goal}">${p.label}</a>`)
        .join('<span aria-hidden="true"> · </span>')}</p>
    </div>

    <form class="booking__form glass" id="booking-form" novalidate aria-label="Заявка на бронирование стола">
      <div class="form__fields">
        <div class="form__choice" data-choice hidden>
          <p class="label label--dot">${seating.choiceTitle}</p>
          <p class="form__choice-sel" data-choice-sel></p>
          <p class="form__choice-sum" data-choice-sum></p>
          <p class="form__choice-note">${seating.note}</p>
          <a class="form__choice-edit" href="#seats">${seating.choiceEdit}</a>
        </div>

        <label class="field">
          <span class="field__label">Имя <b aria-hidden="true">*</b></span>
          <input class="input" name="name" type="text" autocomplete="name" required minlength="2" maxlength="60">
          <span class="field__error" data-err="name" role="alert"></span>
        </label>
        <label class="field">
          <span class="field__label">Телефон <b aria-hidden="true">*</b></span>
          <input class="input" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (___) ___-__-__" required>
          <span class="field__error" data-err="phone" role="alert"></span>
        </label>

        <div class="form__row">
          ${stepper({ name: 'adults', label: 'Взрослые', min: 1, max: 20, value: 2 })}
          ${stepper({ name: 'kids4', label: 'Дети от 4 лет', min: 0, max: 10, value: 0 })}
          ${stepper({ name: 'kidsU4', label: 'Дети до 4 лет', min: 0, max: 5, value: 0 })}
        </div>

        <fieldset class="field field--seg" data-tablepos>
          <legend class="field__label">Расположение стола</legend>
          <div class="seg">
            ${bookingBlock.tablePositions
              .map(
                (t, i) => `<label class="seg__item"><input type="radio" name="table" value="${t}"${i === 2 ? ' checked' : ''}><span>${t}</span></label>`,
              )
              .join('')}
          </div>
        </fieldset>

        <fieldset class="field field--hot">
          <legend class="field__label">Горячее <small>в сумме равно числу взрослых</small></legend>
          <div class="form__row form__row--2">
            ${stepper({ name: 'veal', label: 'Телятина', min: 0, max: 20, value: 2 })}
            ${stepper({ name: 'zander', label: 'Судак', min: 0, max: 20, value: 0 })}
          </div>
          <span class="field__error" data-err="hot" role="alert"></span>
        </fieldset>

        <label class="field">
          <span class="field__label">Комментарий</span>
          <textarea class="input input--area" name="comment" rows="3" maxlength="400"></textarea>
        </label>

        <input class="hp" type="text" name="site" tabindex="-1" autocomplete="off" aria-hidden="true">

        <label class="check">
          <input type="checkbox" name="consent" required>
          <span>${bookingBlock.consent}. <a href="${import.meta.env.BASE_URL}privacy.html">Политика обработки персональных данных</a></span>
        </label>
        <span class="field__error" data-err="consent" role="alert"></span>

        <div class="form__submit">
          <span class="btn-wrap"><button class="btn btn--primary" type="submit" data-goal="form_submit"><span>${bookingBlock.submit}</span></button></span>
          <p class="form__status" data-status role="status"></p>
        </div>
      </div>
      <div class="form__success" data-success hidden>
        <p class="form__success-title chrome">${bookingBlock.success.split('.')[0]}.</p>
        <p>${bookingBlock.success.split('. ').slice(1).join('. ')}</p>
      </div>
    </form>
  </div>
  <dialog class="modal glass" id="booking-modal" aria-labelledby="modal-title">
    <p class="modal__title chrome" id="modal-title">${bookingBlock.modalTitle}</p>
    <p class="modal__text">${bookingBlock.modalText}</p>
    <div class="modal__calls">
      ${phones.map((p) => `<span class="btn-wrap"><a class="btn btn--primary" href="${p.href}" data-goal="${p.goal}"><span>${p.label}</span></a></span>`).join('')}
    </div>
    <span class="btn-wrap"><button class="btn btn--secondary" type="button" data-modal-close><span>${bookingBlock.modalClose}</span></button></span>
  </dialog>`;
}

export function initBooking(): void {
  const form = document.querySelector<HTMLFormElement>('#booking-form');
  if (!form) return;

  const steps = new Map<string, HTMLElement>();
  form.querySelectorAll<HTMLElement>('[data-step]').forEach((el) => steps.set(el.dataset.step!, el));

  const get = (n: string): number => Number((steps.get(n)!.querySelector('input') as HTMLInputElement).value);
  const set = (n: string, v: number): void => {
    const el = steps.get(n)!;
    const min = Number(el.dataset.min), max = Number(el.dataset.max);
    const val = Math.max(min, Math.min(max, v));
    (el.querySelector('input') as HTMLInputElement).value = String(val);
    el.querySelector('[data-val]')!.textContent = String(val);
    el.querySelector<HTMLButtonElement>('[data-dir="-1"]')!.disabled = val <= min;
    el.querySelector<HTMLButtonElement>('[data-dir="1"]')!.disabled = val >= max;
  };

  /** Горячее: телятина + судак всегда равны числу взрослых (перекладываем порцию между блюдами). */
  const hot = (changed: 'veal' | 'zander' | 'adults', dir = 0): void => {
    const adults = get('adults');
    let veal = get('veal'), zander = get('zander');
    if (changed === 'adults') {
      zander = Math.min(zander, adults);
      veal = adults - zander;
    } else if (changed === 'veal') {
      veal = Math.max(0, Math.min(adults, veal));
      zander = adults - veal;
    } else {
      zander = Math.max(0, Math.min(adults, zander));
      veal = adults - zander;
    }
    void dir;
    set('veal', veal);
    set('zander', zander);
  };

  steps.forEach((el, name) => {
    el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-dir]');
      if (!btn || btn.disabled) return;
      const dir = Number(btn.dataset.dir);
      set(name, get(name) + dir);
      if (name === 'adults') hot('adults');
      else if (name === 'veal' || name === 'zander') {
        // шаг в одну сторону забирает порцию у другого блюда
        hot(name, dir);
      }
    });
    set(name, get(name));
  });
  // верхние границы горячего зависят от взрослых
  steps.get('veal')!.dataset.max = '40';
  steps.get('zander')!.dataset.max = '40';
  hot('adults');

  // Выбор на схеме подставляется в форму: взрослые, дети от 4 лет и расположение стола считаются по местам
  const choice = form.querySelector<HTMLElement>('[data-choice]')!;
  const tablePos = form.querySelector<HTMLElement>('[data-tablepos]')!;
  const applyPicks = (): void => {
    const picks = getPicks();
    const lock = picks.length > 0;
    choice.hidden = !lock;
    tablePos.hidden = lock;
    const adultsStep = steps.get('adults')!;
    const kidsStep = steps.get('kids4')!;
    adultsStep.dataset.min = lock ? '0' : '1';
    adultsStep.dataset.max = lock ? '40' : '20';
    kidsStep.dataset.max = lock ? '40' : '10';
    if (lock) {
      const kids = picks.filter((p) => p.kind === 'child').length;
      set('adults', picks.length - kids);
      set('kids4', kids);
      hot('adults');
      const zone = Math.min(...picks.map((p) => (p.table <= 2 ? 1 : p.table <= 5 ? 2 : 3)));
      const want = zone === 3 ? bookingBlock.tablePositions[1] : bookingBlock.tablePositions[0];
      form.querySelectorAll<HTMLInputElement>('input[name="table"]').forEach((r) => { r.checked = r.value === want; });
      choice.querySelector('[data-choice-sel]')!.textContent = selectionText();
      choice.querySelector('[data-choice-sum]')!.textContent = `${picks.length} ${picks.length === 1 ? 'место' : picks.length < 5 ? 'места' : 'мест'}: взрослых ${picks.length - kids}, детей от 4 лет ${kids} · ${fmt(totalPrice())} ${prices.currency}`;
    } else {
      set('adults', Math.max(1, Math.min(20, get('adults'))));
      set('kids4', Math.min(10, get('kids4')));
      hot('adults');
    }
    for (const step of [adultsStep, kidsStep]) {
      step.classList.toggle('is-locked', lock);
      if (lock) step.querySelectorAll<HTMLButtonElement>('.stepper__btn').forEach((b) => { b.disabled = true; });
    }
  };
  onSelectionChange(applyPicks);

  // маска телефона +7 (999) 999-99-99
  const phone = form.elements.namedItem('phone') as HTMLInputElement;
  phone.addEventListener('input', () => {
    let d = phone.value.replace(/\D/g, '');
    if (d.startsWith('8')) d = '7' + d.slice(1);
    if (!d.startsWith('7')) d = '7' + d;
    d = d.slice(0, 11);
    const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
    phone.value = `+7${p[0] ? ` (${p[0]}` : ''}${p[0].length === 3 ? ')' : ''}${p[1] ? ` ${p[1]}` : ''}${p[2] ? `-${p[2]}` : ''}${p[3] ? `-${p[3]}` : ''}`;
  });

  const err = (k: string, msg: string): void => {
    const el = form.querySelector<HTMLElement>(`[data-err="${k}"]`);
    if (el) el.textContent = msg;
  };
  const status = form.querySelector<HTMLElement>('[data-status]')!;
  const modal = document.querySelector<HTMLDialogElement>('#booking-modal');
  modal?.querySelector('[data-modal-close]')?.addEventListener('click', () => modal.close());
  modal?.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    ['name', 'phone', 'hot', 'consent'].forEach((k) => err(k, ''));
    status.textContent = '';
    const fd = new FormData(form);
    const name = String(fd.get('name') ?? '').trim();
    const digits = String(fd.get('phone') ?? '').replace(/\D/g, '');
    let ok = true;
    if (name.length < 2) { err('name', 'Укажите имя'); ok = false; }
    if (digits.length !== 11) { err('phone', 'Введите номер полностью: +7 и 10 цифр'); ok = false; }
    if (get('veal') + get('zander') !== get('adults')) { err('hot', 'Порций горячего должно быть столько же, сколько взрослых'); ok = false; }
    if (!fd.get('consent')) { err('consent', 'Нужно согласие на обработку персональных данных'); ok = false; }
    if (fd.get('site')) return; // ловушка для ботов
    if (!ok) {
      form.querySelector<HTMLElement>('.field__error:not(:empty)')?.closest('.field, .check, fieldset')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    const payload = {
      name,
      phone: String(fd.get('phone')),
      adults: get('adults'),
      kidsFrom4: get('kids4'),
      kidsUnder4: get('kidsU4'),
      table: String(fd.get('table')),
      hot: { veal: get('veal'), zander: get('zander') },
      comment: String(fd.get('comment') ?? '').trim(),
      seats: getPicks().map((p) => ({ table: p.table, seat: p.seat, kind: p.kind, price: pickPrice(p) })),
      total: totalPrice(),
      event: event.name,
    };
    if (!booking.endpoint) {
      // канал заявок ещё не подключён: честно говорим об этом и даём позвонить
      const modal = document.querySelector<HTMLDialogElement>('#booking-modal');
      if (modal && typeof modal.showModal === 'function') modal.showModal();
      else status.innerHTML = `${bookingBlock.modalTitle}. ${bookingBlock.modalText} ${phones.map((p) => `<a href="${p.href}">${p.label}</a>`).join(' · ')}`;
      return;
    }
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submit.disabled = true;
    try {
      const res = await fetch(booking.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(String(res.status));
      form.classList.add('is-sent');
      form.querySelector<HTMLElement>('.form__fields')!.hidden = true;
      form.querySelector<HTMLElement>('[data-success]')!.hidden = false;
    } catch {
      status.innerHTML = `Не удалось отправить заявку. Позвоните нам: ${phones.map((p) => `<a href="${p.href}">${p.label}</a>`).join(' · ')}`;
      submit.disabled = false;
    }
  });
}
