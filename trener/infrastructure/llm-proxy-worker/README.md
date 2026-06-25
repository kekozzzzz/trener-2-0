# LLM-прокси через Cloudflare Worker

Прокси к Anthropic для сервера в РФ. Снимает разом две проблемы:

- **гео-блок 403** — прямой запрос к `api.anthropic.com` с российского IP отбивается;
- **DPI-глушилку TLS** — туннель к зарубежному VPS режется на этапе рукопожатия.

IP Cloudflare из РФ доступны стабильно (на них уже работает сайт-туннель), а Worker
ходит к Anthropic со стороны Cloudflare.

## Как запросы текут

```
сервер (РФ) ──HTTPS к Cloudflare──► Worker ──► api.anthropic.com
   x-api-key: <ключ>                 проверяет     ключ проксируется как есть
   x-proxy-secret: <секрет>          секрет
```

Ключ Anthropic в Worker не хранится — приходит от сервера и пересылается. В Worker
живёт только `PROXY_SECRET` (общий секрет доступа).

## Деплой (через панель Cloudflare, без wrangler)

1. Завести бесплатный аккаунт на dash.cloudflare.com (карта не нужна).
2. **Compute (Workers) → Create → Start from Hello World → Deploy.**
3. **Edit code** → вставить целиком содержимое [worker.js](worker.js) → **Deploy**.
4. **Settings → Variables and Secrets → добавить секрет** `PROXY_SECRET` со случайным
   длинным значением. Тот же секрет пойдёт в `.env.production` сервера.
5. Скопировать адрес Worker'а (вида `https://<имя>.<аккаунт>.workers.dev`).

## Переменные окружения сервера (`.env.production`)

```
ANTHROPIC_API_KEY=<боевой ключ>
ANTHROPIC_BASE_URL=https://<имя>.<аккаунт>.workers.dev
ANTHROPIC_PROXY_SECRET=<тот же PROXY_SECRET, что в Worker>
```

`ANTHROPIC_PROXY_URL` (старый CONNECT-прокси) при этом оставлять пустым.

## Если всё равно 403 от Anthropic

Worker исполнился на российском edge-узле Cloudflare → Anthropic видит российский
egress. Включить **Smart Placement** в настройках Worker — исполнение уйдёт ближе к
бэкенду (Anthropic), egress перестанет быть российским.
