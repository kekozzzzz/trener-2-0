---
name: project_nginx_upload_limit
description: Белый экран при загрузке пачки 10+ турниров = nginx-лимит тела 1МБ на VM; поднят до 50m на обоих nginx
metadata: 
  node_type: memory
  type: project
  originSessionId: 8d2d93e5-65aa-4f62-9c48-c08b37470128
---

Симптом: загрузка пачки 10+ HH-файлов → белый экран «Application error: a client-side exception». В консоли: `413 Request Entity Too Large` на `/analyze` + «An unexpected response was received from the server» (это ошибка Server Actions Next.js, когда сервер вернул страницу ошибки вместо ответа экшена).

Причина (НЕ i18n): перед приложением ДВА nginx — релей КЗ `92.60.75.87` → nginx на VM `81.26.186.177:443` → Next.js `127.0.0.1:3000`. На VM `client_max_body_size` не был задан вообще → дефолт nginx 1 МБ; пачка ~200КБ×10 его пробивала. `bodySizeLimit: 50mb` в next.config.ts бесполезен, пока nginx впереди режет раньше.

Фикс (2026-07-01, сделан живьём, без деплоя кода): добавил `client_max_body_size 50m;` в блок 443 vhost `whygrid` на VM; на релее было 20m → тоже 50m. Бэкапы `whygrid.bak.<ts>` рядом, `nginx -t` + `systemctl reload`. Проверено: POST 2МБ и 10МБ на /analyze дают 307 (не 413).

Доступ к VM: прямого SSH снаружи нет (reset) — только джампом через релей: `ssh -i ~/.ssh/id_ed25519 -J root@92.60.75.87 -l trener-vm 81.26.186.177` (sudo без пароля). Релей: `ssh -i ~/.ssh/id_ed25519 root@92.60.75.87` (root). Тот же ключ на обоих. Топология изменилась против старых заметок: релей проксирует НЕ в реверс-туннель, а на VM-nginx :443.

ОСТАЛОСЬ (код, не задеплоено, ждёт конца i18n): нет `global-error.tsx` — поэтому ЛЮБАЯ ошибка рендера = белый экран; + проверка суммарного размера пачки на клиенте. [[project_deploy_status]] [[project_upload_no_block_locked_analysis]]
