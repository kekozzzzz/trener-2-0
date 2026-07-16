---
name: project_tournament_delete
description: Удаление турнира в UI НЕ реализовано (только дизайн-макет); делается вручную soft-delete в прод-БД через релей-jump; нужно для перезалива (дедуп пропускает удалённые)
metadata: 
  node_type: memory
  type: project
  originSessionId: 40d6574c-1354-4333-8b3b-657ef0f37157
---

**Удаление турнира пользователем в интерфейсе НЕ сделано** (2026-07-15). Кнопка «Удалить турнир» есть только в дизайн-макете (app/design-preview/page.tsx, демо DropdownMenu), реальной кнопки и server-action нет. Поле под мягкое удаление в схеме заложено: `tournaments.deleted_at` (@map deleted_at, запрет 5 — только soft delete, не DELETE). Артём решил кнопку НЕ делать: для будущих юзеров отбор раздач считается правильно уже при загрузке, перезалив им не нужен.

**Зачем вообще удалять:** отбор раздач (`selectedForCard`) считается ОДИН раз при парсинге файла (parse-tournament.ts) и пишется в БД; открытие турнира на сайте запускает только разбор уже отобранного, переотбор не делается. Значит турнир, загруженный ДО правок отбора, держит старый отбор. Чтобы применить новый — надо перезалить файл. Но дедуп (features/tournaments/actions.ts uploadTournament) отклонит повтор как DUPLICATE — **если старый не удалён**: ключ дедупа `sameKey` фильтрует `deletedAt: null`. Поэтому soft-delete старого РАЗБЛОКИРУЕТ перезалив.

**КАК удалить вручную (soft-delete в прод-БД, по прямой команде Артёма над ЕГО данными):**
- Доступ к ВМ: `ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null -o "ProxyCommand=ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null -W %h:%p root@92.60.75.87" -l trener-vm 81.26.186.177` (релей КЗ 92.60.75.87 → jump к ВМ). Кириллица в %USERPROFILE% → предупреждения known_hosts безобидны, соединение проходит.
- Приложение на ВМ: `/home/trener-vm/trener-2-0/trener`. Прод-БД ЛОКАЛЬНАЯ (PostgreSQL на ВМ), psql в `/usr/bin/psql`.
- ⚠️`DATABASE_URL` из `.env.production` содержит Prisma-параметр `connection_limit` — нативный psql (libpq) его НЕ понимает («invalid URI query parameter»): срезать query-часть `sed 's/?.*//'`. URL в контекст НЕ печатать (подставлять в аргумент psql).
- Передавать скрипт на ВМ через `ssh ... 'bash -s' <<'REMOTE'` (не вложенный heredoc для psql — конфликт за stdin; SQL давать `psql -c "..."` одной строкой).
- SQL soft-delete с ТРОЙНОЙ защитой (только его турниры + только целевые id + только не-удалённые) + RETURNING для сверки: `UPDATE tournaments t SET deleted_at=now(), updated_at=now() FROM players p WHERE t.player_id=p.id AND p.email='<email>' AND t.deleted_at IS NULL AND substring(t.id::text,1,8) IN (...) RETURNING ...;`

**Инцидент-повод 2026-07-15:** Артём открыл старый турнир (загружен пачкой 14.07, до правок отбора cd37955) — увидел «20 рук, 10 раздач для разбора» с мусором («чуть шире колл»). Причина — старый отбор в БД. Удалил 10 его турниров по прямой команде для перезалива. Осталось 26 активных. Если после перезалива мусор в отборе останется — это КАЛИБРОВКА классификатора (что метить STRONG), не отбор. [[project_deploy_procedure]] [[project_glm_latency_incident]]
