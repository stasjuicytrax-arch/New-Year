'use strict';

const https = require('node:https');
const dns = require('node:dns');

const env = (key) => process.env[key] || '';
const TIMEOUT_MS = 5000;

/** Connect through a reachable Cloudflare edge while retaining the relay's Host,
 * SNI and certificate verification. Only DNS resolution changes; credentials
 * are still sent exclusively to the configured relay over verified HTTPS. */
function relayLookup(hostname, options, callback) {
  dns.lookup(env('TELEGRAM_RELAY_CONNECT_HOST') || hostname, { ...options, family: 4 }, callback);
}

function tgCall(method, payload) {
  return new Promise((resolve) => {
    const token = env('TELEGRAM_BOT_TOKEN');
    if (!token) return resolve({ ok: false, reason: 'Telegram не настроен' });
    let base;
    try { base = new URL(env('TELEGRAM_API_BASE') || 'https://api.telegram.org'); }
    catch { return resolve({ ok: false, reason: 'Неверный TELEGRAM_API_BASE' }); }
    if (base.protocol !== 'https:') return resolve({ ok: false, reason: 'Telegram требует HTTPS' });

    const body = JSON.stringify(payload);
    let request;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(result);
    };
    // A socket inactivity timeout alone does not bound DNS lookup or TLS setup.
    const deadline = setTimeout(() => {
      finish({ ok: false, reason: 'Telegram: превышено время ожидания' });
      request?.destroy();
    }, TIMEOUT_MS);
    try {
      request = https.request({
        hostname: base.hostname,
        servername: base.hostname,
        port: base.port || 443,
        path: `${base.pathname.replace(/\/$/, '')}/bot${token}/${method}`,
        method: 'POST',
        ...(env('TELEGRAM_RELAY_CONNECT_HOST') && base.hostname !== 'api.telegram.org' ? { lookup: relayLookup } : {}),
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(env('TELEGRAM_RELAY_KEY') ? { 'X-Relay-Key': env('TELEGRAM_RELAY_KEY') } : {}),
        },
      }, (response) => {
        let raw = '';
        response.on('data', (chunk) => { raw += chunk; });
        response.on('error', () => finish({ ok: false, reason: 'Telegram: ответ прерван' }));
        response.on('end', () => {
          let data;
          try { data = JSON.parse(raw); } catch { return finish({ ok: false, reason: `Telegram: неверный ответ (HTTP ${response.statusCode})` }); }
          finish({
            ok: response.statusCode === 200 && data.ok === true,
            result: data.result,
            reason: `HTTP ${response.statusCode}${data.description ? `: ${data.description}` : ''}`,
          });
        });
      });
      request.on('error', (error) => finish({ ok: false, reason: error.code || 'Telegram: ошибка соединения' }));
      request.end(body);
    } catch {
      finish({ ok: false, reason: 'Telegram: не удалось создать запрос' });
      request?.destroy();
    }
  });
}

module.exports = { tgCall };
