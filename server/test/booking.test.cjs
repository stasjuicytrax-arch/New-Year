const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const ID = 'a123456789';
const CHAT = '-100123';
const DAY = 86400000;
const clone = (value) => JSON.parse(JSON.stringify(value));

function setup({ role = 'administrator', failSave = false, failEdit = false, failMember = false } = {}) {
  let state = { holds: { [ID]: { id: ID, status: 'booked', seats: ['10-1', '10-2'], text: 'Заявка', createdAt: Date.now() - DAY, updatedAt: Date.now(), expiresAt: Date.now() + DAY, chatId: CHAT, messageId: 48 } } };
  const calls = [];
  let saves = 0;
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(require.resolve('../lead-handler.js'), 'utf8'), {
    module, exports: module.exports, Buffer, Date, Intl,
    process: { env: { TELEGRAM_CHAT_ID: CHAT } },
    console: { error() {} },
    require: (name) => name === './telegram' ? {
      tgCall: async (method, payload) => {
        calls.push({ method, payload: clone(payload) });
        if (method === 'getChatMember') return failMember ? { ok: false, reason: 'network unavailable' } : { ok: true, result: { status: role } };
        if (method === 'editMessageText' && failEdit) { failEdit = false; return { ok: false, reason: 'HTTP 502' }; }
        return { ok: true, result: true };
      },
    } : require(name),
  });
  return {
    ...module.exports, calls,
    ctx: { store: { load: async () => clone(state), save: async (value) => { if (failSave) throw new Error('storage unavailable'); state = clone(value); saves++; } } },
    get state() { return state; },
    get saves() { return saves; },
  };
}

function callback(action = 'un', chat = CHAT) {
  return { callback_query: { id: 'test-query', data: `${action}:${ID}`, from: { id: 1, first_name: 'Администратор' }, message: { message_id: 48, chat: { id: chat }, text: 'Заявка' } } };
}

test('release frees only this booking and removes its Telegram button', async () => {
  const app = setup();
  app.state.holds.other = { status: 'booked', seats: ['10-6'] };
  const result = await app.handleCallback(callback(), app.ctx);
  assert.equal(result.status, 200);
  assert.equal(app.state.holds[ID].status, 'released');
  assert.deepEqual(clone(app.seatStatuses(app.state, Date.now())), { '10-6': 'booked' });
  const edit = app.calls.find((call) => call.method === 'editMessageText').payload;
  assert.match(edit.text, /Снял бронь/);
  assert.deepEqual(edit.reply_markup.inline_keyboard, []);
  assert.equal(app.calls.at(-1).payload.text, 'Бронь снята, места свободны');
});

test('a repeated release repairs the message without releasing a newer booking', async () => {
  const app = setup({ failEdit: true });
  assert.equal((await app.handleCallback(callback(), app.ctx)).status, 503);
  assert.equal(app.state.holds[ID].status, 'released');
  app.state.holds.newer = { status: 'booked', seats: ['10-1'] };
  assert.equal((await app.handleCallback(callback(), app.ctx)).status, 200);
  assert.equal(app.saves, 1);
  assert.equal(app.state.holds[ID].text.match(/Снял бронь/g).length, 1);
  assert.equal(app.seatStatuses(app.state, Date.now())['10-1'], 'booked');
  assert.equal(app.calls.filter((call) => call.method === 'editMessageText').length, 2);
});

test('a failed save leaves the booking occupied and shows an explicit error', async () => {
  const app = setup({ failSave: true });
  assert.equal((await app.handleCallback(callback(), app.ctx)).status, 503);
  assert.equal(app.state.holds[ID].status, 'booked');
  assert.equal(app.calls.some((call) => call.method === 'editMessageText'), false);
  assert.equal(app.calls.at(-1).payload.show_alert, true);
});

test('non-admins and callbacks outside the configured channel cannot release seats', async () => {
  const member = setup({ role: 'member' });
  await member.handleCallback(callback(), member.ctx);
  assert.equal(member.state.holds[ID].status, 'booked');
  assert.equal(member.saves, 0);
  assert.equal(member.calls.at(-1).payload.show_alert, true);
  const otherChat = setup();
  await otherChat.handleCallback(callback('un', '-100999'), otherChat.ctx);
  assert.equal(otherChat.saves, 0);
  assert.equal(otherChat.calls.some((call) => call.method === 'getChatMember'), false);
});

test('failed Telegram rights lookup returns a retriable error without changing the booking', async () => {
  const app = setup({ failMember: true });
  const result = await app.handleCallback(callback(), app.ctx);
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'telegram_unavailable');
  assert.equal(app.saves, 0);
  assert.equal(app.state.holds[ID].status, 'booked');
});

test('confirm still leaves the release button on the same message', async () => {
  const app = setup();
  app.state.holds[ID].status = 'hold';
  await app.handleCallback(callback('ok'), app.ctx);
  assert.equal(app.state.holds[ID].status, 'booked');
  const markup = app.calls.find((call) => call.method === 'editMessageText').payload.reply_markup;
  assert.equal(markup.inline_keyboard[0][0].callback_data, `un:${ID}`);
});

test('expired holds cannot confirm seats now occupied by another guest', async () => {
  const app = setup();
  app.state.holds[ID].status = 'hold';
  app.state.holds[ID].expiresAt = Date.now() - DAY;
  app.state.holds.other = { status: 'booked', seats: ['10-1'] };
  await app.handleCallback(callback('ok'), app.ctx);
  assert.equal(app.saves, 0);
  assert.match(app.calls.at(-1).payload.text, /заняты другой заявкой/);
});

test('cleanup retains confirmed bookings older than seven days', () => {
  const app = setup();
  const now = Date.now();
  const old = now - 30 * DAY;
  const state = { holds: {
    booked: { status: 'booked', createdAt: old, updatedAt: old, seats: ['1-1'] },
    active: { status: 'hold', createdAt: old, expiresAt: now + DAY, seats: ['2-1'] },
    expired: { status: 'hold', createdAt: old, expiresAt: now - 10 * DAY },
    recentlyExpired: { status: 'hold', createdAt: old, expiresAt: now - DAY },
    released: { status: 'released', createdAt: old, updatedAt: old },
  } };
  app.prune(state, now);
  assert.deepEqual(Object.keys(state.holds).sort(), ['active', 'booked', 'recentlyExpired']);
  assert.equal(app.seatStatuses(state, now)['1-1'], 'booked');
});

test('storage failures never report all seats as available', async () => {
  const app = setup();
  const result = await app.handleStatus({ store: { load: async () => { throw new Error('offline'); } } });
  assert.equal(result.status, 503);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.seats, undefined);
});

test('a webhook without a storage token is retriable, not silently acknowledged', async () => {
  const previous = process.env.TELEGRAM_WEBHOOK_SECRET;
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
  try {
    const { handler } = require('../index.js');
    const result = await handler({ httpMethod: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'test-secret' }, body: '{}' }, {});
    assert.equal(result.statusCode, 503);
  } finally {
    if (previous === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = previous;
  }
});
