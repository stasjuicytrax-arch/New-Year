const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const env = { WEBHOOK_SECRET: 'test-hook', FUNCTION_URL: 'https://function.example.test', TELEGRAM_BOT_TOKEN: 'fake-token', RELAY_KEY: 'test-relay' };
function setup(fetch) {
  const module = { exports: {} };
  const source = readFileSync(join(__dirname, '../relay/worker.js'), 'utf8').replace('export default', 'module.exports =');
  vm.runInNewContext(source, { module, fetch, TextEncoder, Request, Response, URL, AbortSignal, console: { error() {} } });
  return module.exports;
}
const hook = (secret = 'test-hook') => new Request('https://relay.example.test/hook', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': secret }, body: '{"callback_query":{"id":"query"}}' });

test('webhook is acknowledged only after the function completes', async () => {
  let complete;
  let finished = false;
  const worker = setup(() => new Promise((resolve) => { complete = resolve; }));
  const pending = worker.fetch(hook(), env, {}).then((result) => { finished = true; return result; });
  await new Promise(setImmediate);
  assert.equal(finished, false);
  complete(Response.json({ ok: true }));
  assert.equal((await pending).status, 200);
});

test('upstream failure returns 503 so Telegram retries and alerts the administrator', async () => {
  const calls = [];
  const worker = setup(async (url, options) => {
    calls.push({ url, options });
    return url === env.FUNCTION_URL ? new Response('offline', { status: 503 }) : Response.json({ ok: true });
  });
  assert.equal((await worker.fetch(hook(), env, {})).status, 503);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /answerCallbackQuery$/);
  assert.equal(JSON.parse(calls[1].options.body).show_alert, true);
});

test('invalid webhook authentication never reaches the function', async () => {
  let calls = 0;
  const worker = setup(async () => { calls++; });
  assert.equal((await worker.fetch(hook('wrong'), env, {})).status, 403);
  assert.equal(calls, 0);
});

test('relay allows only existing bot methods and retains its key check', async () => {
  let calls = 0;
  const worker = setup(async () => { calls++; return Response.json({ ok: true }); });
  const request = (method, key) => new Request(`https://relay.example.test/botfake-token/${method}`, { method: 'POST', headers: { 'X-Relay-Key': key }, body: '{}' });
  assert.equal((await worker.fetch(request('getChatMember', 'wrong'), env, {})).status, 403);
  assert.equal((await worker.fetch(request('deleteMessage', 'test-relay'), env, {})).status, 403);
  assert.equal((await worker.fetch(request('getChatMember', 'test-relay'), env, {})).status, 200);
  assert.equal(calls, 1);
});
