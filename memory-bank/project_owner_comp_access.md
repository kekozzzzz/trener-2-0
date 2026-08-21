---
name: project_owner_comp_access
description: Стена в проде ВКЛючена; владелец проходит по admin-байпасу; комп-доступ для не-админа = строка max-подписки (был выдан тестеру zebster@bk.ru 2026-06-28, закрыт 2026-08-04)
metadata: 
  node_type: memory
  type: project
  originSessionId: 368315ea-b54a-4c8a-9e2a-e279f8b154de
  modified: 2026-08-04T16:53:10.576Z
---

ОБНОВЛЕНО 2026-06-28: проверено на проде — `SUBSCRIPTION_GATE_ENABLED=true`, **платная стена ВКЛЮЧЕНА** (после go-live ЮKassa). Прежняя заметка «гейта нет, у всех полный доступ» устарела.

**Владелец** (`artemkekoz@gmail.com`) доступ получает не подпиской, а **admin-байпасом**: `assessAiAccess` в `features/usage/budget.ts` зовёт `isAdminEmail` (`config/admin.ts`, переопределяемо `ADMIN_EMAILS`) и пускает без лимита. Отдельная подписка владельцу не нужна. Админ ≠ подписка: админ-список ещё и открывает расходы LLM по всем игрокам.

**Комп-доступ не-админу** (тестер/проверяющий, которому НЕ нужны админ-данные) = строка `max`-подписки, БЕЗ внесения в `ADMIN_EMAILS`. Бюджет `max` = $31.5 себестоимости ИИ / 30 дней (метр сам перекатывается каждые 30 дней — `effectivePeriodStart`), ~125 разборов/мес — для проверки с запасом.

**Как выдал тестеру `zebster@bk.ru` (2026-06-28, на проде):** создал Player (email + termsAcceptedAt) и Subscription `status=ACTIVE, planCode=max, currentPeriodStart=now, nextPaymentAt=2099-01-01, paymentMethodId=null, externalSubscriptionId='comp-zebster-bk-ru'`. Payment-проводку НЕ писал (реальных денег нет — финансовую ленту не подделывать). Карта не привязана + срок далеко → крон автопродления/напоминаний и `runSubscriptionRenewals` её НЕ трогают (секция 2 гасит EXPIRED только при `nextPaymentAt<now`). Вход — по магик-ссылке на тот же email (аккаунт уже есть → сразу сессия). Скрипт — разовый `_grant_tmp.cjs` в `~/trener-2-0/trener` через релей-jump ([[feedback_server_ops_self]]), удалён после.

**«Потом закроем»:** soft-delete — выставить `subscriptions.deletedAt=now` (или `status=EXPIRED`) у этого игрока; необратимого ничего.

**Закрыто 2026-08-04:** доступ снят по просьбе Артёма — на проде выставлены `status=EXPIRED,
deletedAt=2026-08-04T16:50:19Z` для подписки `comp-zebster-bk-ru` (напрямую через SSH-джамп на VM,
[[feedback_server_ops_self]]). Player и история турниров не тронуты — только подписка, soft-delete
(правило проекта №5). Вернуть доступ снова — обнулить `deletedAt` и `status=ACTIVE`.
