---
name: project_llm_connectivity_block
description: "РЕШЕНО 2026-06-17: LLM из РФ через релей-nginx на VPS в Казахстане (92.60.75.87). Ниже — история диагностики."
metadata: 
  node_type: memory
  type: project
  originSessionId: 666dafa6-8149-496a-a8cd-a25f5e25bcfe
---

**РЕШЕНО 2026-06-17.** Рабочий канал: trener-vm (РФ) → HTTPS-релей (nginx на VPS в Казахстане, IP 92.60.75.87, ~490₽/мес) → api.anthropic.com. Проверено боевым вызовом — Claude отвечает. Ключевое открытие: РФ-сервер НЕ отрезан целиком — режут только западные сети (Cloudflare/Hetzner отказывают РФ-IP из-за санкций), а до национальных IP нейтральных стран (Казахстан, Армения, Сербия) связь живая. Казахстан в списке поддерживаемых Anthropic → релей оттуда снимает 403.

Настройка релея: nginx на VPS — `listen 443 ssl` с самоподписанным cert (SAN=IP `92.60.75.87`, `/etc/ssl/relay/`), `proxy_pass https://api.anthropic.com` + `proxy_ssl_server_name on`, проверка заголовка `x-proxy-secret`. На trener-vm в `.env.production`: `ANTHROPIC_BASE_URL=https://92.60.75.87`, `ANTHROPIC_PROXY_SECRET`, боевой `ANTHROPIC_API_KEY`. Ключ на VPS не хранится — проксируется насквозь.

**Главный подвох (стоил часов отладки):** доверие к самоподписанному серту релея НЕЛЬЗЯ задавать через undici-`Agent` в `fetchOptions.dispatcher` — версия пакета `undici` в проекте не совпадает со встроенной в Node, и любой такой Agent в глобальном fetch валит КАЖДЫЙ вызов с `UND_ERR_INVALID_ARG: invalid onRequestStart method` (а SDK показывает обёртку `Connection error`, маскируя причину). Решение: серт доверяется через переменную окружения `NODE_EXTRA_CA_CERTS=/home/trener-vm/relay-ca.pem`, задаётся в pm2 (`export ... && pm2 restart trener --update-env && pm2 save`), читается встроенным fetch. Адаптер — только `baseURL` + `x-proxy-secret` + `maxRetries`, без своего dispatcher. Итог в коде: коммит 3478aec. Проверено в проде — разборы генерятся, карточки на сайте.

**Telegram — та же стена (проверено 2026-06-18):** VM (РФ) до `api.telegram.org` НЕ достаёт (таймаут, КОД:000), казахстанский релей `92.60.75.87` достаёт (401). Значит служебный бот-сторож (тревоги/дайджест) шлёт сообщения с VM тоже через релей. План встройки — `plans/2026-06-18-бот-сторож-телеграм.md`. Нюанс: токен Telegram лежит в URL запроса → на релее отключить access_log для Telegram-прохода, чтобы токен не попал в логи.

Незакрытые хвосты: (1) nginx на VPS один раз не поднялся сам после ребута — проверить автозапуск (`systemctl enable nginx`, релей = единая точка отказа); (2) автодеплой не подтянул свежий коммит сам (`deploy.sh` пропустил fetch) — пулил вручную, разобраться почему; (3) на VPS добавлен swap 2 ГБ (`/swapfile`, в fstab) — без него `next build` на 2 ГБ вставал; (4) мёртвый путь CONNECT-прокси (`ANTHROPIC_PROXY_URL`/`ProxyAgent`) в адаптере сломан тем же конфликтом undici — удалить при случае.

---

Прод-VM в Yandex Cloud (РФ) не может надёжно достучаться до зарубежных API — DPI рубит TLS-рукопожатие к большинству чужих IP. Диагностика 2026-06-17 (curl с trener-vm):

- `api.anthropic.com` (IP `160.79.104.10`, НЕ Cloudflare): TLS проходит за ~0.1с, но **403** — гео-блок Anthropic по российскому IP.
- Зарубежный Cloudflare anycast (`104.x`/`172.6x`): TLS **глушится** (виснет на ClientHello, таймаут). Проверено даже с нейтральным SNI через `--resolve` — режут сами IP, не имя домена. Значит Cloudflare Worker/Pages/custom-домен отсюда **недостижимы**, покупка домена не помогает.
- Cloudflare-кэш-нода внутри РФ (`8.6.112.0`, отдаёт cdnjs/unpkg): работает — но это только статический кэш, Worker там не исполняется.
- Голландский VPS (AdminVPS, raw IP, self-signed): TLS глушился (1 ответ из 5). Сервер отменён 2026-06-16.

**DPI-обход проверен и не помог (2026-06-17).** Поставили zapret (собрали из исходников, Ubuntu 22.04, nftables). `blockcheck` нашёл рабочие стратегии для классической РКН-блокировки по SNI (rutracker.org ✓ — значит zapret на машине функционирует, облачный NAT его не сломал). Но применённая стратегия (`multidisorder --dpi-desync-split-pos=2`) к нашим целям — Cloudflare Worker (`172.67.176.102`) и Hetzner (`213.133.116.44`) — дала таймаут. Причина: эти адреса режут не по имени (SNI), а по IP/маршруту (TSPU-throttle), а десинхронизация ClientHello этого не лечит. Голландский raw-IP и Cloudflare anycast — тот же случай.

**Вывод:** сервер в РФ принципиально не может обслуживать этот продукт — ядро (Claude) либо гео-блок 403 напрямую, либо за релеем, а путь до любого релея режется по IP и DPI-обходом не пробивается. Реальный путь — хостинг за рубежом. Это упирается в 152-ФЗ (ПДн россиян положено хранить в РФ) и в невыбранное юрлицо: чистый техвариант (всё за рубежом) конфликтует с законом для РФ-оператора; комплаентный вариант (основная БД в РФ) технически нерабочий (до Anthropic из РФ не достучаться). Это стратегическая развилка про юридический дом продукта, не про код. Связано с [[project_legal_status]], [[project_infra_roadmap]].

Код прокси уже готов и ждёт рабочего канала: в адаптере `infrastructure/adapters/llm/anthropic.ts` поддержан `ANTHROPIC_BASE_URL` + `ANTHROPIC_PROXY_SECRET` (HTTPS-прокси) и `ANTHROPIC_PROXY_URL` (CONNECT, запасной); Worker-скрипт в `infrastructure/llm-proxy-worker/`.

См. также [[project_deploy_status]], [[project_infra_roadmap]], [[project_payments_blocked]].
