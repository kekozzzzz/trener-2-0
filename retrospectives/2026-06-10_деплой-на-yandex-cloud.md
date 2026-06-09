# Ретро: первый деплой на Yandex Cloud + публичный доступ

**Дата:** 2026-06-10
**Длительность:** ~многочасовая сессия (с переходом через полночь)
**План:** не было отдельного plans/-файла, делали по ходу

## 1. Задача

Сделать первый деплой "Тренер 2.0": завести VM в Yandex Cloud, настроить автодеплой по `git push`, поднять БД, открыть сайт публично.

## 2. Как решал

- Создан репозиторий на GitHub (`kekozzzzz/trener-2-0`), приватный.
- Поднята VM в Yandex Cloud (Ubuntu, Node.js 22, PostgreSQL 17 локально как замена Managed PostgreSQL на этапе теста).
- Docker не подошёл — Docker Hub заблокирован из RU-зоны Yandex Cloud (TLS handshake timeout на pull `node:22-alpine`). Перешли на прямой запуск через Node.js + pm2.
- npm install завис на дефолтном registry — решилось через `--registry https://registry.npmmirror.com`.
- Автозапуск после перезагрузки VM — через cron `@reboot` + `pm2 resurrect` (системный pm2 startup сломался из-за PATH).
- Автодеплой — polling-скрипт `~/deploy.sh` по cron каждые 5 минут: `git fetch` → если есть новые коммиты → `git pull` + `npm install` + `npm run build` + `pm2 restart trener`.
- Внешний доступ по IP/портам 22 и 3000 так и не заработал, несмотря на корректные security groups, NAT, iptables — осталось нерешённым. Обошли через **Cloudflare Tunnel** (`cloudflared tunnel --url`), запущенный как отдельный pm2-процесс `tunnel`.
- Для автодеплоя приватного репо настроили SSH deploy key (`~/.ssh/github`) + `~/.ssh/config` с `IdentityFile`, переключили origin на `git@github.com:...` — HTTPS с приватным репо падал (то auth, то SSL timeout).
- Финально проверили автодеплой пустым коммитом — сервер сам подтянул, собрал и перезапустил `trener`, не тронув `tunnel`.

## 3. Решил?

- [x] Да, полностью (для текущего этапа: сайт открыт публично, автодеплой работает)

Сайт доступен по адресу: `https://modular-lawyer-admitted-copy.trycloudflare.com` (Cloudflare quick tunnel, держится через pm2).

## 4. Что можно было лучше

- Очень много времени ушло на проблемы с сетью из RU-зоны Yandex Cloud (Docker Hub, npm registry, GitHub HTTPS) — в следующий раз сразу проверять доступность внешних реестров и сразу закладывать SSH + npmmirror.
- Внешний доступ по портам VM (22/3000) так и не заработал — стоит отдельно разобраться (возможно, проблема на уровне провайдера/маршрутизации, а не конфигурации), но это не блокер благодаря туннелю.
- Quick Tunnel (trycloudflare.com) — не постоянный URL: если процесс `tunnel` перезапустится (например, после ребута VM), ссылка изменится. Для постоянного адреса нужен свой домен, привязанный к Cloudflare (отложено по решению пользователя).

## 5. Как было / как стало

- **Было:** код только локально, никакого хостинга, сайт недоступен.
- **Стало:** VM в Yandex Cloud с PostgreSQL, Next.js-приложением под pm2, автодеплоем по `git push` (через cron-поллинг + SSH deploy key) и публичным доступом через Cloudflare Tunnel.

## Follow-up (если нужно)

- Заполнить `ANTHROPIC_API_KEY` в `.env.production` на VM, когда понадобятся LLM-фичи (сейчас пусто).
- При желании — купить домен и настроить постоянный named Cloudflare Tunnel вместо quick tunnel.
- Разобраться с недоступностью VM по внешнему IP (порты 22/3000) — возможно, баг/особенность сети Yandex Cloud.
- Перейти на Yandex Managed PostgreSQL вместо локального Postgres на VM, когда продукт выйдет за рамки теста спроса.
