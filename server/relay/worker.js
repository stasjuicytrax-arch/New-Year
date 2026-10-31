/* Ретранслятор Telegram Bot API для функции заявок ngperm.ru.
   Пропускает только POST на /bot<наш токен>/{sendMessage,editMessageText,answerCallbackQuery,getChatMember} с заголовком X-Relay-Key. Всё остальное: 403. */

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
  async fetch(request, env, ctx) {
    const deny = () => new Response('Forbidden', { status: 403 });

    // Подтверждаем доставку только после успешного ответа функции. Иначе Telegram
    // должен повторить запрос; фоновая пересылка с немедленным 200 теряет нажатия.
    const hook = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (hook !== null) {
      if (request.method !== 'POST' || !env.WEBHOOK_SECRET || !env.FUNCTION_URL || !same(hook, env.WEBHOOK_SECRET)) return deny();
      const body = await request.text();
      let update;
      try { update = JSON.parse(body); }
      catch { return new Response('Bad Request', { status: 400 }); }
      try {
        const delivered = await fetch(env.FUNCTION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': hook },
          body,
          signal: AbortSignal.timeout(45000),
        });
        if (!delivered.ok) throw new Error(`HTTP ${delivered.status}`);
        const result = await delivered.json();
        if (result.ok !== true) throw new Error('Function rejected update');
        return new Response('ok');
      } catch {
        // Never log request headers, bot tokens, or guest details.
        console.error('Telegram webhook: function delivery failed');
        if (update.callback_query?.id && env.TELEGRAM_BOT_TOKEN) {
          try {
            await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: update.callback_query.id,
                text: 'Сервис бронирования временно недоступен. Проверьте статус заявки и попробуйте ещё раз.',
                show_alert: true,
              }),
              signal: AbortSignal.timeout(4000),
            });
          } catch { /* Telegram will retry the failed webhook. */ }
        }
        return new Response('Retry later', { status: 503 });
      }
    }

    if (!env.RELAY_KEY || !env.TELEGRAM_BOT_TOKEN) return deny();
    if (request.method !== 'POST') return deny();
    if (!same(request.headers.get('X-Relay-Key') || '', env.RELAY_KEY)) return deny();

    const url = new URL(request.url);
    // только методы, которые нужны функции заявок: отправка, правка сообщения, ответ на нажатие кнопки
    const allowed = ['sendMessage', 'editMessageText', 'answerCallbackQuery', 'getChatMember'];
    if (!allowed.some((m) => same(url.pathname, `/bot${env.TELEGRAM_BOT_TOKEN}/${m}`))) return deny();

    try {
      const res = await fetch(`https://api.telegram.org${url.pathname}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: request.body,
        signal: AbortSignal.timeout(4000),
      });
      return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
      console.error('Telegram upstream request failed', error.name, request.cf?.colo || 'unknown');
      return Response.json({ ok: false, description: 'Telegram upstream unavailable' }, { status: 503 });
    }
  },
};
