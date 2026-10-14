/* Состояние броней: один JSON-файл в Yandex Object Storage (бакет приватный).
   Доступ по IAM-токену сервисного аккаунта функции (context.token), заголовок X-YaCloud-SubjectToken. */

'use strict';

const https = require('https');

const BUCKET = () => process.env.SEATS_BUCKET || 'ngperm-seats-2027';
const KEY = 'state.json';

function call(method, token, body) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.from(body, 'utf8');
    const req = https.request(
      {
        hostname: 'storage.yandexcloud.net',
        path: `/${BUCKET()}/${KEY}`,
        method,
        headers: {
          'X-YaCloud-SubjectToken': token,
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}),
        },
        timeout: 6000,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: raw }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('storage timeout')));
    req.on('error', reject);
    req.end(data);
  });
}

/** token — IAM-токен из context.token.access_token */
function createStore(token) {
  return {
    async load() {
      const r = await call('GET', token);
      if (r.status === 404) return { holds: {} };
      if (r.status !== 200) throw new Error(`storage GET ${r.status}`);
      const s = JSON.parse(r.body);
      return s && s.holds ? s : { holds: {} };
    },
    async save(state) {
      const r = await call('PUT', token, JSON.stringify(state));
      if (r.status !== 200) throw new Error(`storage PUT ${r.status}`);
    },
  };
}

module.exports = { createStore };
