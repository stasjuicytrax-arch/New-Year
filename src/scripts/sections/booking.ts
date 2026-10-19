import { booking, bookingBlock, event, guestChannel, phones, prices, seating, telegramChannel } from '../../content/content';
import { ICON_TG } from '../icons';
import { lockScroll } from '../scroll';
import { KID_AGE, KIDS_MAX } from '../../data/seating';
import { applySeatStatuses, clearSelection, getKids, getPicks, hasSelection, kidsText, onSelectionChange, pickPrice, seatsText, setKidAge, setKidsCount, totalPrice } from './seating';

/**
 * Заявка на бронь: окно над схемой зала. Открывается кнопкой «Забронировать» в полосе итога, сверху «Ваш выбор»,
 * ниже имя, телефон, горячее, комментарий и согласие. Заявка уходит на booking.endpoint (Telegram-бот через serverless);
 * пока канал не подключён, окно честно говорит об этом и показывает телефоны (успех не имитируется).
 */

const fmt = (n: number): string => new Intl.NumberFormat('ru-RU').format(n).replace(/\s/g, ' ');
const callLinks = (): string => phones.map((p) => `<a href="${p.href}" data-goal="${p.goal}">${p.label}</a>`).join('<span aria-hidden="true"> · </span>');

const stepper = (name: string, label: string): string => `
  <div class="field field--step" data-step="${name}">
    <span class="field__label" id="lb-${name}">${label}</span>
    <div class="stepper" role="group" aria-labelledby="lb-${name}">
      <button type="button" class="stepper__btn" data-dir="-1" aria-label="Меньше: ${label}">−</button>
      <output class="stepper__val" data-val aria-live="polite">0</output>
      <button type="button" class="stepper__btn" data-dir="1" aria-label="Больше: ${label}">+</button>
    </div>
    <input type="hidden" name="${name}" value="0">
  </div>`;

export function renderBooking(): string {
  return `
  <dialog class="bk glass" id="booking-dialog" aria-labelledby="bk-title">
    <div class="bk__in" data-lenis-prevent>
      <header class="bk__head">
        <h3 class="bk__title chrome" id="bk-title">${bookingBlock.title}</h3>
        <button type="button" class="bk__x" data-bk-close aria-label="${bookingBlock.close}"><span aria-hidden="true">×</span></button>
      </header>

      <form class="bk__form" id="booking-form" novalidate aria-labelledby="bk-title">
        <div class="bk__scroll" data-lenis-prevent>
          <div class="form__choice" data-choice>
            <p class="label label--dot">${seating.choiceTitle}</p>
            <p class="form__choice-sel" data-choice-sel></p>
            <p class="form__choice-kids" data-choice-kids></p>
            <p class="form__choice-sum" data-choice-sum></p>
            <p class="form__choice-note">${seating.note}</p>
            <button type="button" class="form__choice-edit" data-bk-close>${bookingBlock.edit}</button>
          </div>

          <div class="form__fields bk__main">
            <div class="form__row form__row--2 bk__np">
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
            </div>

            <fieldset class="field field--kidsbk" data-kidsbk>
              <legend class="field__label">${bookingBlock.kidsLegend} <small>${fmt(prices.child)} ${prices.currency}, ${bookingBlock.kidsHint}</small></legend>
              <div class="stepper bk__kstep" role="group" aria-label="${seating.kidsStepper}">
                <button type="button" class="stepper__btn" data-kk="-1" aria-label="Меньше: ${seating.kidsStepper}">−</button>
                <output class="stepper__val" data-kk-val aria-live="polite">0</output>
                <button type="button" class="stepper__btn" data-kk="1" aria-label="Больше: ${seating.kidsStepper}">+</button>
              </div>
              <ul class="kids__ages" data-kk-ages></ul>
            </fieldset>

            <fieldset class="field field--hot" data-hot>
              <legend class="field__label">${bookingBlock.hotTitle} <small>${bookingBlock.hotHint}</small></legend>
              <div class="form__row form__row--2">
                ${stepper('veal', bookingBlock.veal)}
                ${stepper('zander', bookingBlock.zander)}
              </div>
              <span class="field__error" data-err="hot" role="alert"></span>
            </fieldset>

            <label class="field">
              <span class="field__label">${bookingBlock.comment}</span>
              <textarea class="input input--area" name="comment" rows="2" maxlength="400" placeholder="${bookingBlock.commentPlaceholder}"></textarea>
            </label>

            <input class="hp" type="text" name="site" tabindex="-1" autocomplete="off" aria-hidden="true">

            <label class="check">
              <input type="checkbox" name="consent" required>
              <span>${bookingBlock.consent}. <a href="${import.meta.env.BASE_URL}privacy.html">Политика обработки персональных данных</a></span>
            </label>
            <span class="field__error" data-err="consent" role="alert"></span>
          </div>

          <p class="bk__call">${bookingBlock.callLine} ${callLinks()}</p>
        </div>

        <div class="bk__bar form__submit">
          <p class="bk__total" data-bar-total></p>
          <span class="btn-wrap"><button class="btn btn--primary" type="submit" data-goal="form_submit"><span>${bookingBlock.submit}</span></button></span>
          <p class="form__status" data-status role="status"></p>
        </div>
      </form>

      <div class="bk__done" data-success hidden>
        <p class="form__success-title chrome">${bookingBlock.successTitle}</p>
        <p>${bookingBlock.successText}</p>
        ${telegramChannel ? `<div class="bk__tg"><p>${guestChannel.successNote}</p><span class="btn-wrap"><a class="btn btn--primary btn--tg btn--tg-lg" href="${telegramChannel}" target="_blank" rel="noopener noreferrer" data-goal="tg_success">${ICON_TG}<span>${guestChannel.successCta}</span></a></span></div>` : ''}
        <span class="btn-wrap"><button class="btn btn--secondary" type="button" data-bk-close><span>${bookingBlock.close}</span></button></span>
      </div>

      <div class="bk__done" data-fallback hidden>
        <p class="form__success-title chrome" data-fallback-title>${bookingBlock.modalTitle}</p>
        <p>${bookingBlock.modalText}</p>
        <div class="modal__calls">
          ${phones.map((p) => `<span class="btn-wrap"><a class="btn btn--primary btn--call" href="${p.href}" data-goal="${p.goal}"><span>${p.name} · ${p.label}</span></a></span>`).join('')}
        </div>
        <span class="btn-wrap"><button class="btn btn--secondary" type="button" data-bk-back><span>${bookingBlock.edit}</span></button></span>
      </div>
    </div>
  </dialog>`;
}

export function initBooking(): void {
  const dlg = document.querySelector<HTMLDialogElement>('#booking-dialog');
  const form = document.querySelector<HTMLFormElement>('#booking-form');
  if (!dlg || !form) return;

  const success = dlg.querySelector<HTMLElement>('[data-success]')!;
  const fallback = dlg.querySelector<HTMLElement>('[data-fallback]')!;
  const failTitle = fallback.querySelector<HTMLElement>('[data-fallback-title]')!;
  const status = form.querySelector<HTMLElement>('[data-status]')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const hotBox = form.querySelector<HTMLElement>('[data-hot]')!;
  const steps = new Map<string, HTMLElement>();
  form.querySelectorAll<HTMLElement>('[data-step]').forEach((el) => steps.set(el.dataset.step!, el));

  /* ---------- горячее: телятина + судак всегда равны числу выбранных мест ---------- */
  let seatsCount = 0;
  const get = (n: string): number => Number((steps.get(n)!.querySelector('input') as HTMLInputElement).value);
  const set = (n: string, v: number): void => {
    const el = steps.get(n)!;
    const val = Math.max(0, Math.min(seatsCount, v));
    (el.querySelector('input') as HTMLInputElement).value = String(val);
    el.querySelector('[data-val]')!.textContent = String(val);
    el.querySelector<HTMLButtonElement>('[data-dir="-1"]')!.disabled = val <= 0;
    el.querySelector<HTMLButtonElement>('[data-dir="1"]')!.disabled = val >= seatsCount;
  };
  /** Менять одно блюдо = перекладывать порцию из другого. */
  const setHot = (changed: 'veal' | 'zander', v: number): void => {
    const n = Math.max(0, Math.min(seatsCount, v));
    if (changed === 'veal') { set('veal', n); set('zander', seatsCount - n); }
    else { set('zander', n); set('veal', seatsCount - n); }
  };
  steps.forEach((el, name) => {
    el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-dir]');
      if (!btn || btn.disabled) return;
      setHot(name as 'veal' | 'zander', get(name) + Number(btn.dataset.dir));
    });
  });

  /* ---------- дети: счётчик и возраст каждого, синхронно с блоком на странице ---------- */
  const kkVal = form.querySelector<HTMLElement>('[data-kk-val]')!;
  const kkAges = form.querySelector<HTMLElement>('[data-kk-ages]')!;
  const ageWord = (a: number): string => (a >= 5 && a <= 20 ? 'лет' : a % 10 === 1 ? 'год' : a % 10 >= 2 && a % 10 <= 4 ? 'года' : 'лет');
  const paintKidsBk = (): void => {
    const ages = getKids();
    kkVal.textContent = String(ages.length);
    form.querySelector<HTMLButtonElement>('[data-kk="-1"]')!.disabled = ages.length <= 0;
    form.querySelector<HTMLButtonElement>('[data-kk="1"]')!.disabled = ages.length >= KIDS_MAX;
    if (kkAges.children.length !== ages.length) {
      const opts = Array.from({ length: KID_AGE.max - KID_AGE.min + 1 }, (_, i) => KID_AGE.min + i);
      kkAges.innerHTML = ages
        .map((_, i) => `<li class="kids__age"><label for="bk-kid-age-${i}">Ребёнок ${i + 1}</label><select id="bk-kid-age-${i}" class="input kids__select" data-kk-age="${i}">${opts.map((a) => `<option value="${a}">${a} ${ageWord(a)}</option>`).join('')}</select></li>`)
        .join('');
    }
    kkAges.querySelectorAll<HTMLSelectElement>('[data-kk-age]').forEach((sel) => { sel.value = String(ages[Number(sel.dataset.kkAge)]); });
  };
  form.querySelectorAll<HTMLButtonElement>('[data-kk]').forEach((b) => b.addEventListener('click', () => setKidsCount(getKids().length + Number(b.dataset.kk))));
  kkAges.addEventListener('change', (e) => {
    const sel = (e.target as Element).closest<HTMLSelectElement>('[data-kk-age]');
    if (sel) setKidAge(Number(sel.dataset.kkAge), Number(sel.value));
  });
  onSelectionChange(() => { if (dlg.open) paintChoice(); });

  /* ---------- «Ваш выбор» ---------- */
  const choice = form.querySelector<HTMLElement>('[data-choice]')!;
  const paintChoice = (): void => {
    const picks = getPicks();
    const kids = getKids();
    const sel = choice.querySelector<HTMLElement>('[data-choice-sel]')!;
    sel.textContent = seatsText();
    sel.hidden = picks.length === 0;
    const kidsEl = choice.querySelector<HTMLElement>('[data-choice-kids]')!;
    kidsEl.textContent = kidsText();
    kidsEl.hidden = kids.length === 0;
    const sum = `${seating.total} ${fmt(totalPrice())} ${prices.currency}`;
    choice.querySelector('[data-choice-sum]')!.textContent = sum;
    form.querySelector('[data-bar-total]')!.textContent = sum;
    // горячее нужно только тем, кто сидит за столом; по умолчанию все телятина
    const n = picks.length;
    if (n !== seatsCount) {
      const zander = Math.min(get('zander'), n);
      seatsCount = n;
      set('zander', zander);
      set('veal', n - zander);
    }
    hotBox.hidden = n === 0;
    paintKidsBk();
  };

  const reset = (): void => {
    form.hidden = false;
    success.hidden = true;
    fallback.hidden = true;
    status.textContent = '';
    submit.disabled = false;
    ['name', 'phone', 'hot', 'consent'].forEach((k) => err(k, ''));
  };
  const open = (): void => {
    if (!hasSelection()) return;
    reset();
    paintChoice();
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    lockScroll(true);
    (document.activeElement as HTMLElement | null)?.blur();
    dlg.scrollTop = 0;
    form.querySelector<HTMLElement>('.bk__scroll')!.scrollTop = 0;
  };
  const close = (): void => {
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  };
  dlg.addEventListener('close', () => lockScroll(false));
  dlg.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t === dlg || t.closest('[data-bk-close]')) close();
    if (t.closest('[data-bk-back]')) reset();
  });
  document.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-open-booking]')) open();
  });

  /* ---------- маска телефона +7 (999) 999-99-99 ---------- */
  const phone = form.elements.namedItem('phone') as HTMLInputElement;
  phone.addEventListener('input', () => {
    let d = phone.value.replace(/\D/g, '');
    if (d.startsWith('8')) d = '7' + d.slice(1);
    if (!d.startsWith('7')) d = '7' + d;
    d = d.slice(0, 11);
    const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
    phone.value = `+7${p[0] ? ` (${p[0]}` : ''}${p[0].length === 3 ? ')' : ''}${p[1] ? ` ${p[1]}` : ''}${p[2] ? `-${p[2]}` : ''}${p[3] ? `-${p[3]}` : ''}`;
  });

  function showFallback(title: string): void {
    failTitle.textContent = title;
    form!.hidden = true;
    fallback.hidden = false;
    submit.disabled = false;
    dlg!.scrollTop = 0;
  }

  function err(k: string, msg: string): void {
    const el = form!.querySelector<HTMLElement>(`[data-err="${k}"]`);
    if (el) el.textContent = msg;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    ['name', 'phone', 'hot', 'consent'].forEach((k) => err(k, ''));
    status.textContent = '';
    if (!hasSelection()) { status.textContent = 'Выберите места или детские билеты'; return; }
    const fd = new FormData(form);
    const name = String(fd.get('name') ?? '').trim();
    const digits = String(fd.get('phone') ?? '').replace(/\D/g, '');
    let ok = true;
    if (name.length < 2) { err('name', 'Укажите имя'); ok = false; }
    if (digits.length !== 11) { err('phone', 'Введите номер полностью: +7 и 10 цифр'); ok = false; }
    if (seatsCount > 0 && get('veal') + get('zander') !== seatsCount) { err('hot', bookingBlock.hotError); ok = false; }
    if (!fd.get('consent')) { err('consent', 'Нужно согласие на обработку персональных данных'); ok = false; }
    if (fd.get('site')) return; // ловушка для ботов
    if (!ok) {
      form.querySelector<HTMLElement>('.field__error:not(:empty)')?.closest('.field, .check, fieldset')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    const payload = {
      name,
      phone: String(fd.get('phone')),
      seats: getPicks().map((p) => ({ table: p.table, seat: p.seat, price: pickPrice(p) })),
      kids: getKids().map((age) => ({ age, price: prices.child })),
      hot: { veal: seatsCount ? get('veal') : 0, zander: seatsCount ? get('zander') : 0 },
      comment: String(fd.get('comment') ?? '').trim(),
      total: totalPrice(),
      event: event.name,
    };
    if (!booking.endpoint) {
      // канал заявок ещё не подключён: честно говорим об этом и даём позвонить
      showFallback(bookingBlock.modalTitle);
      return;
    }
    submit.disabled = true;
    try {
      const res = await fetch(booking.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.status === 409) {
        // кто-то успел раньше: схема обновляется, занятые места снимаются из выбора
        const j = (await res.json().catch(() => ({}))) as { seats?: Record<string, string> };
        if (j.seats) applySeatStatuses(j.seats);
        status.textContent = bookingBlock.seatsTaken;
        submit.disabled = false;
        if (!hasSelection()) close();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      form.hidden = true;
      success.hidden = false;
      dlg.scrollTop = 0;
      // заявка принята: выбор и поля формы сбрасываются, нижняя панель «Забронировать» уходит
      form.reset();
      clearSelection();
    } catch {
      showFallback(bookingBlock.failTitle);
    }
  });
}
