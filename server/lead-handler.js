/* Обработчик заявок с формы брони ngperm.ru («Главная новогодняя ночь 2027»). Без зависимостей: чистый Node.js.
   Заявка уходит в Telegram и копией на почту (smtp.yandex.ru:465, SSL).
   Секреты берутся из переменных окружения функции и в логи не попадают. */

'use strict';

const https = require('https');
const tls = require('tls');

const env = (k) => process.env[k] || '';

/* Не больше 5 заявок с одного адреса за 10 минут (в пределах живого экземпляра функции) */
const RATE_LIMIT = 5;
const RATE_WINDOW = 10 * 60 * 1000;
const hits = new Map();

function tooOften(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 2000) hits.clear();
  return list.length > RATE_LIMIT;
}

const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const int = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

function validate(body) {
  /* Ловушка для ботов: поле «site» спрятано на странице, человек его не заполняет */
  if (clean(body.site, 50) || clean(body.company, 50)) return { error: 'spam' };

  const name = clean(body.name, 80);
  const phone = clean(body.phone, 30);
  const digits = phone.replace(/\D/g, '');
  if (name.length < 2) return { error: 'Укажите имя' };
  if (digits.length !== 11) return { error: 'Укажите телефон целиком' };

  const hot = body.hot && typeof body.hot === 'object' ? body.hot : {};
  // Места со схемы зала: [{ table, seat, price }]. Дети сидят в отдельном зале: детские билеты без мест, [{ age, price }].
  const seats = (Array.isArray(body.seats) ? body.seats : [])
    .slice(0, 40)
    .map((x) => ({ table: int(x && x.table, 15), seat: int(x && x.seat, 8), price: int(x && x.price, 100000) }))
    .filter((x) => x.table >= 1 && x.seat >= 1);
  const kids = (Array.isArray(body.kids) ? body.kids : [])
    .slice(0, 10)
    .map((x) => ({ age: int(x && x.age, 18), price: int(x && x.price, 100000) }))
    .filter((x) => x.age >= 1);
  const total = seats.reduce((a, x) => a + x.price, 0) + kids.reduce((a, x) => a + x.price, 0);
  return {
    lead: {
      name,
      phone,
      veal: int(hot.veal, 99),
      zander: int(hot.zander, 99),
      comment: clean(body.comment, 400),
      seats,
      kids,
      total,
      event: clean(body.event, 120) || 'Главная новогодняя ночь 2027',
    },
  };
}

function leadLines(l) {
  const rows = [
    ['Имя', l.name],
    ['Телефон', l.phone],
  ];
  const rub = (n) => `${new Intl.NumberFormat('ru-RU').format(n).replace(/\s/g, ' ')} ₽`;
  if (l.seats && l.seats.length) {
    const byTable = new Map();
    for (const x of l.seats) byTable.set(x.table, [...(byTable.get(x.table) || []), x.seat]);
    rows.push(['Места на схеме', [...byTable].map(([t, a]) => `стол ${t}: ${a.join(', ')}`).join(' · ') + ` — ${rub(l.seats.reduce((a, x) => a + x.price, 0))}`]);
  }
  if (l.seats && l.seats.length) rows.push(['Горячее', `телятина ${l.veal}, судак ${l.zander}`]);
  // Строка про детей есть всегда: «Дети: 2 (возраст: 5, 8) — 14 000 ₽» или «Дети: нет»
  if (l.kids && l.kids.length) {
    const ages = l.kids.map((k) => k.age).sort((x, y) => x - y);
    rows.push(['Дети', `${l.kids.length} (возраст: ${ages.join(', ')}) — ${rub(l.kids.reduce((x, k) => x + k.price, 0))}`]);
  } else {
    rows.push(['Дети', 'нет']);
  }
  if ((l.seats && l.seats.length) || (l.kids && l.kids.length)) rows.push(['Итого', rub(l.total)]);
  if (l.comment) rows.push(['Комментарий', l.comment]);
  return rows;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function telegramText(l) {
  return [
    `<b>Новая заявка на стол · ${esc(l.event)}</b>`,
    '',
    ...leadLines(l).map(([k, v]) => `${k}: ${esc(v)}`),
    '',
    `Получено: ${l.received_at}`,
  ].join('\n');
}

function plainText(l) {
  return [
    `Новая заявка на стол · ${l.event}`,
    '',
    ...leadLines(l).map(([k, v]) => `${k}: ${v}`),
    '',
    `Получено: ${l.received_at}`,
    'Источник: форма брони на ngperm.ru',
  ].join('\r\n');
}

/* Вызов Bot API. Из Яндекс.Облака api.telegram.org недоступен (проверено 13.10.2026), поэтому адрес подменяется
   на релей вне РФ: TELEGRAM_API_BASE=https://relay.example.workers.dev, ключ релея уходит заголовком X-Relay-Key. */
function tgCall(method, payload) {
  return new Promise((resolve) => {
    const token = env('TELEGRAM_BOT_TOKEN');
    if (!token) return resolve({ ok: false, reason: 'Telegram не настроен' });
    let base;
    try { base = new URL(env('TELEGRAM_API_BASE') || 'https://api.telegram.org'); } catch { return resolve({ ok: false, reason: 'Неверный TELEGRAM_API_BASE' }); }
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: base.hostname,
        port: base.port || 443,
        path: `${base.pathname.replace(/\/$/, '')}/bot${token}/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(env('TELEGRAM_RELAY_KEY') ? { 'X-Relay-Key': env('TELEGRAM_RELAY_KEY') } : {}),
        },
        timeout: 8000,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let j = {};
          try { j = JSON.parse(raw); } catch { /* не JSON */ }
          resolve({ ok: res.statusCode === 200 && j.ok !== false, result: j.result, reason: `HTTP ${res.statusCode}${j.description ? `: ${j.description}` : ''}` });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ ok: false, reason: e.message }));
    req.end(body);
  });
}

/** Заявка в канал; markup — inline-кнопки «Подтвердить / Отклонить» (только если места сохранены как hold). */
function sendTelegram(l, markup) {
  const chat = env('TELEGRAM_CHAT_ID');
  if (!chat) return Promise.resolve({ ok: false, reason: 'Telegram не настроен' });
  return tgCall('sendMessage', {
    chat_id: chat,
    text: telegramText(l),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(markup ? { reply_markup: markup } : {}),
  });
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

/** Минимальный SMTP-клиент: implicit TLS (465), AUTH PLAIN. */
function sendMail(l) {
  return new Promise((resolve) => {
    const user = env('SMTP_USER');
    const pass = env('SMTP_PASS');
    const to = env('MAIL_TO');
    if (!user || !pass || !to) return resolve({ ok: false, reason: 'Почта не настроена' });

    const from = user.includes('@') ? user : `${user}@yandex.ru`;
    const subject = `Новогодняя ночь 2027: заявка на стол, ${l.name}, ${l.phone}`;
    const message = [
      `From: =?UTF-8?B?${b64('Сайт ngperm.ru')}?= <${from}>`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${b64(subject)}?=`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      b64(plainText(l)).replace(/(.{76})/g, '$1\r\n'),
    ].join('\r\n');

    const socket = tls.connect({ host: 'smtp.yandex.ru', port: 465, servername: 'smtp.yandex.ru' });
    socket.setTimeout(12000, () => socket.destroy(new Error('timeout')));

    const steps = [
      [null, '220'],
      ['EHLO ngperm.ru', '250'],
      [`AUTH PLAIN ${b64(`\0${from}\0${pass}`)}`, '235'],
      [`MAIL FROM:<${from}>`, '250'],
      [`RCPT TO:<${to}>`, '250'],
      ['DATA', '354'],
      [`${message.replace(/\r\n\./g, '\r\n..')}\r\n.`, '250'],
      ['QUIT', '221'],
    ];
    let i = 0;
    let buf = '';
    let lastText = '';
    let done = false;
    const finish = (r) => {
      if (!done) {
        done = true;
        socket.destroy();
        resolve(r);
      }
    };

    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\r\n');
      const last = lines[lines.length - 2];
      if (!last || last[3] === '-') return; // ответ ещё не закончен (многострочный)
      buf = '';
      lastText = last;
      const code = last.slice(0, 3);
      if (code !== steps[i][1]) return finish({ ok: false, reason: `SMTP, ответ сервера: ${last} (шаг ${i})` });
      i += 1;
      if (i >= steps.length) return finish({ ok: true, reason: 'sent' });
      socket.write(`${steps[i][0]}\r\n`);
    });
    socket.on('error', (e) => finish({ ok: false, reason: e.message }));
    socket.on('close', () => finish({ ok: i >= steps.length - 1, reason: 'closed' }));
  });
}

/* ---------- брони мест ---------- */

const HOLD_MS = 24 * 60 * 60 * 1000;
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const seatKeys = (l) => (l.seats || []).map((x) => `${x.table}-${x.seat}`);

/** Актуальные статусы мест: booked (занято) и held (на брони, пока не истёк срок). */
function seatStatuses(state, now) {
  const out = {};
  for (const rec of Object.values(state.holds || {})) {
    if (rec.status === 'booked') rec.seats.forEach((k) => { out[k] = 'booked'; });
    else if (rec.status === 'hold' && rec.expiresAt > now) rec.seats.forEach((k) => { if (out[k] !== 'booked') out[k] = 'held'; });
  }
  return out;
}

function prune(state, now) {
  for (const [id, rec] of Object.entries(state.holds || {})) if ((rec.updatedAt || rec.createdAt) < now - KEEP_MS) delete state.holds[id];
}

const newId = () => require('crypto').randomBytes(5).toString('hex');

/** GET: статусы мест для схемы на сайте. */
async function handleStatus(ctx) {
  try {
    const state = await ctx.store.load();
    return { status: 200, body: { ok: true, seats: seatStatuses(state, Date.now()) } };
  } catch (e) {
    console.error('Статусы мест не прочитаны:', e.message);
    return { status: 200, body: { ok: true, seats: {} } }; // схема работает и без статусов
  }
}

const buttons = (id) => ({ inline_keyboard: [[{ text: '✅ Подтвердить', callback_data: `ok:${id}` }, { text: '❌ Отклонить', callback_data: `no:${id}` }]] });

/* Принимает разобранное тело запроса, возвращает { status, body } */
async function handleLead(body, meta, ctx) {
  if (tooOften((meta && meta.ip) || 'unknown')) {
    return { status: 429, body: { ok: false, error: 'Слишком много заявок подряд. Попробуйте позже' } };
  }
  const checked = validate(body || {});
  if (checked.error === 'spam') return { status: 200, body: { ok: true } }; // боту отвечаем как обычно, ничего не шлём
  if (checked.error) return { status: 400, body: { ok: false, error: checked.error } };

  const lead = checked.lead;
  const now = Date.now();
  lead.received_at = `${new Date(now).toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg' })} (Пермь)`;

  // Места фиксируются как hold на 24 часа. Если хранилище недоступно, заявка всё равно уходит (без кнопок).
  const keys = seatKeys(lead);
  let state = null;
  let id = null;
  if (ctx && ctx.store && keys.length) {
    try {
      state = await ctx.store.load();
      const taken = seatStatuses(state, now);
      if (keys.some((k) => taken[k])) {
        return { status: 409, body: { ok: false, error: 'seats_taken', seats: taken } };
      }
      prune(state, now);
      id = newId();
      state.holds[id] = { id, status: 'hold', seats: keys, createdAt: now, updatedAt: now, expiresAt: now + HOLD_MS, name: lead.name, phone: lead.phone };
      await ctx.store.save(state);
    } catch (e) {
      console.error('Бронь мест не сохранена:', e.message);
      state = null;
      id = null;
    }
  }

  const [tg, mail] = await Promise.all([sendTelegram(lead, id ? buttons(id) : null), sendMail(lead)]);
  if (!tg.ok) console.error('Telegram не отправлен:', tg.reason);
  if (!mail.ok) console.error('Почта не отправлена:', mail.reason);
  if (!tg.ok && !mail.ok) {
    // заявка не дошла никуда: места не держим
    if (id) {
      try { delete state.holds[id]; await ctx.store.save(state); } catch (e) { console.error('Откат брони не удался:', e.message); }
    }
    return { status: 502, body: { ok: false, error: 'Не удалось отправить заявку' } };
  }
  if (id && tg.ok && tg.result && tg.result.message_id) {
    try {
      const fresh = await ctx.store.load();
      if (fresh.holds[id]) {
        fresh.holds[id].messageId = tg.result.message_id;
        fresh.holds[id].chatId = tg.result.chat && tg.result.chat.id;
        fresh.holds[id].text = telegramText(lead);
        await ctx.store.save(fresh);
      }
    } catch (e) {
      console.error('Не сохранён id сообщения:', e.message);
    }
  }
  return { status: 200, body: { ok: true } };
}

const who = (u) => (u ? [u.first_name, u.last_name].filter(Boolean).join(' ') + (u.username ? ` (@${u.username})` : '') : 'неизвестно');

/** Нажатие кнопки в Telegram: callback_query из webhook. */
async function handleCallback(update, ctx) {
  const cq = update && update.callback_query;
  if (!cq || !cq.data) return { status: 200, body: { ok: true } };
  const m = /^(ok|no):([0-9a-f]{10})$/.exec(cq.data);
  const answer = (text) => tgCall('answerCallbackQuery', { callback_query_id: cq.id, text, show_alert: false });
  if (!m) { await answer('Неизвестная кнопка'); return { status: 200, body: { ok: true } }; }

  const now = Date.now();
  let state;
  try { state = await ctx.store.load(); } catch (e) {
    console.error('Хранилище недоступно:', e.message);
    await answer('Хранилище недоступно, попробуйте ещё раз');
    return { status: 200, body: { ok: true } };
  }
  const rec = state.holds[m[2]];
  if (!rec) { await answer('Заявка не найдена или уже устарела'); return { status: 200, body: { ok: true } }; }
  if (rec.status !== 'hold') { await answer(`Уже обработано: ${rec.status === 'booked' ? 'подтверждено' : 'отклонено'}`); return { status: 200, body: { ok: true } }; }

  const confirm = m[1] === 'ok';
  if (confirm && rec.expiresAt <= now) {
    // срок брони вышел: подтверждаем, только если места никто не занял
    const taken = seatStatuses(state, now);
    if (rec.seats.some((k) => taken[k])) { await answer('Бронь истекла, места уже заняты другой заявкой'); return { status: 200, body: { ok: true } }; }
  }
  rec.status = confirm ? 'booked' : 'rejected';
  rec.updatedAt = now;
  rec.by = who(cq.from);
  try { await ctx.store.save(state); } catch (e) {
    console.error('Статус не сохранён:', e.message);
    await answer('Не удалось сохранить, нажмите ещё раз');
    return { status: 200, body: { ok: true } };
  }

  const stamp = new Date(now).toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg' });
  const line = confirm ? `✅ Подтвердил: ${esc(rec.by)} · ${stamp}. Места заняты.` : `❌ Отклонил: ${esc(rec.by)} · ${stamp}. Места свободны.`;
  const msg = cq.message || {};
  const text = `${rec.text || esc(msg.text || '')}\n\n${line}`;
  const edited = await tgCall('editMessageText', {
    chat_id: (msg.chat && msg.chat.id) || rec.chatId,
    message_id: msg.message_id || rec.messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [] },
  });
  if (!edited.ok) console.error('Сообщение не обновлено:', edited.reason);
  await answer(confirm ? 'Места заняты' : 'Места свободны');
  return { status: 200, body: { ok: true } };
}

module.exports = { handleLead, handleStatus, handleCallback, validate, telegramText, sendTelegram, sendMail, seatStatuses, tgCall };
