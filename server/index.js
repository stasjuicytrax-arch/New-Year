/* Точка входа Yandex Cloud Functions: `index.handler`, среда Node.js 22. */

'use strict';

const { handleLead, handleStatus, handleCallback } = require('./lead-handler');
const { createStore } = require('./store');

const ORIGINS = ['https://ngperm.ru', 'https://www.ngperm.ru'];
const json = (statusCode, headers, body) => ({ statusCode, headers, body: JSON.stringify(body) });

module.exports.handler = async (event, context) => {
  const h = event.headers || {};
  const origin = h.Origin || h.origin || '';
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };

  const method = event.httpMethod || (event.requestContext && event.requestContext.http && event.requestContext.http.method) || 'POST';
  if (method === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  const token = context && context.token && context.token.access_token;
  const ctx = { store: token ? createStore(token) : null };
  if (method === 'GET') {
    const noStore = { ...headers, 'Cache-Control': 'no-store' };
    if (!ctx.store) return json(503, noStore, { ok: false, error: 'Статусы мест временно недоступны' });
    const r = await handleStatus(ctx);
    return json(r.status, noStore, r.body);
  }
  if (method !== 'POST') return json(405, headers, { ok: false, error: 'Метод не поддерживается' });

  // Webhook Telegram: принимаем только с верным secret_token
  const lower = {};
  for (const k of Object.keys(h)) lower[k.toLowerCase()] = h[k];
  const hook = lower['x-telegram-bot-api-secret-token'];
  if (hook !== undefined) {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
    if (!secret || hook !== secret) return json(403, headers, { ok: false });
    if (!ctx.store) return json(503, headers, { ok: false });
    let upd;
    try {
      upd = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '{}');
    } catch {
      return json(400, headers, { ok: false });
    }
    const r = await handleCallback(upd, ctx);
    return json(r.status, headers, r.body);
  }
  // Запросы из чужих браузерных страниц не принимаем (запрос без Origin допускается для проверки из консоли)
  if (origin && !ORIGINS.includes(origin)) return json(403, headers, { ok: false, error: 'Запрещено' });

  let raw = event.body || '{}';
  if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return json(400, headers, { ok: false, error: 'Неверный формат данных' });
  }

  const ip = String(h['X-Forwarded-For'] || h['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const result = await handleLead(data, { ip }, ctx);
  return json(result.status, headers, result.body);
};
