/* Точка входа Yandex Cloud Functions: `index.handler`, среда Node.js 22. */

'use strict';

const { handleLead } = require('./lead-handler');

const ORIGINS = ['https://ngperm.ru', 'https://www.ngperm.ru'];
const json = (statusCode, headers, body) => ({ statusCode, headers, body: JSON.stringify(body) });

module.exports.handler = async (event) => {
  const h = event.headers || {};
  const origin = h.Origin || h.origin || '';
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };

  const method = event.httpMethod || (event.requestContext && event.requestContext.http && event.requestContext.http.method) || 'POST';
  if (method === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (method !== 'POST') return json(405, headers, { ok: false, error: 'Метод не поддерживается' });
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
  const result = await handleLead(data, { ip });
  return json(result.status, headers, result.body);
};
