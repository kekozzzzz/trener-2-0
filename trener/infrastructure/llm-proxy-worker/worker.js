// Cloudflare Worker — HTTPS-прокси к Anthropic для сервера в РФ.
//
// Зачем: прод стоит в России. Прямой запрос к api.anthropic.com отбивается 403
// (гео-блок по IP), а туннель к зарубежному VPS глушит DPI на этапе TLS-рукопожатия.
// IP Cloudflare же из РФ доступны стабильно — на них работает наш сайт-туннель.
// Поэтому сервер шлёт запросы Claude сюда, а Worker пересылает их на api.anthropic.com
// уже со стороны Cloudflare.
//
// Ключ Anthropic в Worker НЕ хранится — он приходит от сервера в заголовке x-api-key
// и проксируется как есть. Worker лишь меняет адрес назначения.
//
// Доступ закрыт общим секретом: заголовок x-proxy-secret должен совпасть с переменной
// окружения PROXY_SECRET (задаётся в настройках Worker, в коде её нет). Это не даёт
// посторонним использовать Worker как бесплатный релей и жечь наш лимит запросов.
//
// ⚠️ Если после деплоя сервер всё равно получает 403 от Anthropic — значит Worker
// исполнился на российском edge-узле Cloudflare, и Anthropic видит российский egress.
// Лечится включением Smart Placement (Settings → выполнять ближе к бэкенду): тогда
// Worker уходит исполняться рядом с Anthropic, и egress перестаёт быть российским.

const UPSTREAM = "https://api.anthropic.com";

export default {
  async fetch(request, env) {
    if (env.PROXY_SECRET && request.headers.get("x-proxy-secret") !== env.PROXY_SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    const incoming = new URL(request.url);
    const upstream = new URL(incoming.pathname + incoming.search, UPSTREAM);

    // Переносим заголовки как есть (x-api-key, anthropic-version и т.д.),
    // кроме служебных: секрет наружу не светим, host подставит сам fetch.
    const headers = new Headers(request.headers);
    headers.delete("x-proxy-secret");
    headers.delete("host");

    const hasBody = request.method !== "GET" && request.method !== "HEAD";

    const resp = await fetch(upstream, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
    });

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers,
    });
  },
};
