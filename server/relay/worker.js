/* Ретранслятор Telegram Bot API для функции заявок ngperm.ru.
   Пропускает только POST на /bot<наш токен>/{sendMessage,editMessageText,answerCallbackQuery} с заголовком X-Relay-Key. Всё остальное: 403. */

const enc = new TextEncoder();

/** Сравнение без утечки по времени. */
function same(a, b) {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}

export default {
  async fetch(request, env) {
    const deny = () => new Response('Forbidden', { status: 403 });
    if (!env.RELAY_KEY || !env.TELEGRAM_BOT_TOKEN) return deny();
    if (request.method !== 'POST') return deny();
    if (!same(request.headers.get('X-Relay-Key') || '', env.RELAY_KEY)) return deny();

    const url = new URL(request.url);
    // только методы, которые нужны функции заявок: отправка, правка сообщения, ответ на нажатие кнопки
    const allowed = ['sendMessage', 'editMessageText', 'answerCallbackQuery'];
    if (!allowed.some((m) => same(url.pathname, `/bot${env.TELEGRAM_BOT_TOKEN}/${m}`))) return deny();

    const res = await fetch(`https://api.telegram.org${url.pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: request.body,
    });
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  },
};
