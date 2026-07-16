---
name: project-admin-stats
description: "Админ-вкладка /admin со сводкой продукта + журнал входов auth_events со странами; собрано 2026-07-02, НЕ задеплоено"
metadata: 
  node_type: memory
  type: project
  originSessionId: b173c6fa-0ebc-4a01-ab25-e2a5dc4c712c
---

Вкладка «Статистика» (/admin) — только владельцу (isAdminEmail, остальным 404):
регистрации/входы по дням и периодам (сутки по МСК, env ADMIN_TZ_OFFSET_HOURS деф.3),
страны за 30 дней, пробник+конверсия, подписки, деньги, загрузки, активность,
расходы ИИ (переиспользован buildCostReport), очередь. Собрано и проверено локально
2026-07-02 (миграция 20260702123840_add_auth_events, 568 тестов, build ок), НЕ задеплоено.

Журнал auth_events (append-only): REGISTER / LOGIN_PASSWORD / LOGIN_MAGIC / LOGIN_FAILED,
пишется во всех 4 точках входа, ошибки глушит (вход не ломает). Хранится только ISO-код
страны через локальный `geoip-country` (пакет в serverExternalPackages — базу нельзя
бандлить); IP НЕ хранится. Регистрации в статистике считаются по Player.createdAt
(полная история), входы — только с деплоя журнала.

**При деплое проверить:** (1) проброс X-Forwarded-For/X-Real-IP на КЗ-релее
(92.60.75.87) — иначе страны у всех NULL/KZ (clientIp в rate-limit.ts берёт первый
XFF); (2) миграция применится сама (instrumentation.ts → migrate deploy), в ней ещё
выравнивание hands.viewed_at до TIMESTAMP(3) — безопасно.

⚠️ Системная особенность репо: prisma migrate dev при КАЖДОЙ новой миграции суёт в
сгенерированный SQL «починку» ручных partial-индексов (WHERE deleted_at IS NULL,
Prisma DSL их не умеет) — файл миграции ЧИСТИТЬ руками перед применением. Локальные
журналы миграций trener_dev/trener_test были в рассинхроне (колонки мимо миграций,
failed-запись с 17.06) — выровнены 2026-07-02 через migrate resolve без потери данных;
migrate reset запрещён deny-листом. [[project_deploy_procedure]] [[project_i18n_english]]
