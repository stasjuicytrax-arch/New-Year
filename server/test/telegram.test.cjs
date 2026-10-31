const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');

function setup(response) {
  const module = { exports: {} };
  let options;
  let timeout;
  let destroyed = false;
  const request = new EventEmitter();
  request.destroy = () => { destroyed = true; };
  request.end = () => {};
  vm.runInNewContext(readFileSync(require.resolve('../telegram.js'), 'utf8'), {
    module, URL, Buffer,
    process: { env: { TELEGRAM_BOT_TOKEN: 'fake-token', TELEGRAM_API_BASE: 'https://relay.example.test', TELEGRAM_RELAY_KEY: 'test-key', TELEGRAM_RELAY_CONNECT_HOST: 'cdnjs.cloudflare.com' } },
    setTimeout: (callback) => { timeout = callback; return 1; }, clearTimeout() {},
    require: (name) => name === 'node:https' ? {
      request: (value, callback) => {
        options = value;
        if (response) queueMicrotask(() => {
          const stream = new EventEmitter();
          stream.statusCode = response.status;
          callback(stream);
          stream.emit('data', response.body);
          stream.emit('end');
        });
        return request;
      },
    } : { lookup: (host, value, callback) => callback(null, '192.0.2.1', 4) },
  });
  return { tgCall: module.exports.tgCall, get options() { return options; }, expire: () => timeout(), get destroyed() { return destroyed; } };
}

test('alternate routing preserves the relay hostname, TLS identity and authentication', async () => {
  const app = setup({ status: 200, body: '{"ok":true,"result":{"status":"creator"}}' });
  const result = await app.tgCall('getChatMember', { user_id: 1 });
  assert.equal(result.ok, true);
  assert.equal(app.options.hostname, 'relay.example.test');
  assert.equal(app.options.servername, 'relay.example.test');
  assert.equal(app.options.rejectUnauthorized, undefined);
  assert.equal(app.options.headers['X-Relay-Key'], 'test-key');
  assert.equal(typeof app.options.lookup, 'function');
});

test('DNS and TLS stalls stop at the overall deadline', async () => {
  const app = setup();
  const promise = app.tgCall('getChatMember', {});
  app.expire();
  assert.equal((await promise).ok, false);
  assert.equal(app.destroyed, true);
});

test('HTML errors and Telegram API errors are never treated as successful delivery', async () => {
  for (const response of [{ status: 403, body: '<html>Forbidden</html>' }, { status: 200, body: '{"ok":false,"description":"denied"}' }, { status: 200, body: '{}' }]) {
    assert.equal((await setup(response).tgCall('sendMessage', {})).ok, false);
  }
});
