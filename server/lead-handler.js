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
  // Места со схемы зала: [{ table, seat, kind: 'adult' | 'child', price }]
  const seats = (Array.isArray(body.seats) ? body.seats : [])
    .slice(0, 40)
    .map((x) => ({ table: int(x && x.table, 15), seat: int(x && x.seat, 8), kind: x && x.kind === 'child' ? 'child' : 'adult', price: int(x && x.price, 100000) }))
    .filter((x) => x.table >= 1 && x.seat >= 1);
  const total = seats.length ? seats.reduce((a, x) => a + x.price, 0) : 0;
  return {
    lead: {
      name,
      phone,
      adults: int(body.adults, 99),
      kidsFrom4: int(body.kidsFrom4, 99),
      kidsUnder4: int(body.kidsUnder4, 99),
      table: clean(body.table, 40),
      veal: int(hot.veal, 99),
      zander: int(hot.zander, 99),
      comment: clean(body.comment, 400),
      seats,
      total,
      event: clean(body.event, 120) || 'Главная новогодняя ночь 2027',
    },
  };
}

function leadLines(l) {
  const rows = [
    ['Имя', l.name],
    ['Телефон', l.phone],
    ['Взрослых', l.adults],
    ['Детей от 4 лет', l.kidsFrom4],
    ['Детей до 4 лет', l.kidsUnder4],
    ['Расположение стола', l.table],
    ['Горячее', `телятина ${l.veal}, судак ${l.zander}`],
  ];
  if (l.seats && l.seats.length) {
    const byTable = new Map();
    for (const x of l.seats) byTable.set(x.table, [...(byTable.get(x.table) || []), `${x.seat}${x.kind === 'child' ? ' (дет.)' : ''}`]);
    rows.push(['Выбор на схеме', [...byTable].map(([t, a]) => `стол ${t}: ${a.join(', ')}`).join(' · ')]);
    rows.push(['Сумма', `${new Intl.NumberFormat('ru-RU').format(l.total).replace(/s/g, ' ')} ₽`]);
  }
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

function sendTelegram(l) {
  return new Promise((resolve) => {
    const token = env('TELEGRAM_BOT_TOKEN');
    const chat = env('TELEGRAM_CHAT_ID');
    if (!token || !chat) return resolve({ ok: false, reason: 'Telegram не настроен' });
    const payload = JSON.stringify({ chat_id: chat, text: telegramText(l), parse_mode: 'HTML', disable_web_page_preview: true });
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 8000,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let desc = '';
          try { desc = JSON.parse(raw).description || ''; } catch { /* не JSON */ }
          resolve({ ok: res.statusCode === 200, reason: `HTTP ${res.statusCode}${desc ? `: ${desc}` : ''}` });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ ok: false, reason: e.message }));
    req.end(payload);
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

/* Принимает разобранное тело запроса, возвращает { status, body } */
async function handleLead(body, meta) {
  if (tooOften((meta && meta.ip) || 'unknown')) {
    return { status: 429, body: { ok: false, error: 'Слишком много заявок подряд. Попробуйте позже' } };
  }
  const checked = validate(body || {});
  if (checked.error === 'spam') return { status: 200, body: { ok: true } }; // боту отвечаем как обычно, ничего не шлём
  if (checked.error) return { status: 400, body: { ok: false, error: checked.error } };

  const lead = checked.lead;
  lead.received_at = `${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Yekaterinburg' })} (Пермь)`;

  const [tg, mail] = await Promise.all([sendTelegram(lead), sendMail(lead)]);
  if (!tg.ok) console.error('Telegram не отправлен:', tg.reason);
  if (!mail.ok) console.error('Почта не отправлена:', mail.reason);
  if (!tg.ok && !mail.ok) return { status: 502, body: { ok: false, error: 'Не удалось отправить заявку' } };
  return { status: 200, body: { ok: true } };
}

module.exports = { handleLead, validate, telegramText, sendTelegram, sendMail };
