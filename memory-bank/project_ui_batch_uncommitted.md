---
name: project_ui_batch_uncommitted
description: Незакоммиченная пачка UI-правок + фича ника (2026-06-22); нужна прод-миграция nickname перед деплоем
metadata: 
  node_type: memory
  type: project
  originSessionId: c57e4699-2fa0-43c0-8d9a-d67798c03559
---

После пуша биллинга (e227711) накопилась НЕзакоммиченная пачка правок 2026-06-22 (ветка master, локально):

**Страница цен /pricing + конфиг:**
- сумма меньше (text-h1 вместо display, whitespace-nowrap) — не переносится;
- «Что входит» вынесено в ОДИН общий блок под колонками (возможности одинаковы у всех);
- различие тарифов — строка объёма из бюджета: «Базовый объём» / «Объём × 3» / «Объём × 8» (честная кратность от бюджета basic, НЕ абсолютные числа — счётчик невидим);
- описания переписаны по частоте игры; поле approxAnalyses удалено из config/plans.ts.

**Навигация (auth-nav.tsx):** у залогиненных убраны пункты «Разбор» (загрузка теперь через «Мои турниры» → кнопка «Загрузить турнир») и «Тарифы» (смена тарифа в «Аккаунте»). У гостя «Тарифы» оставлены.

**Главная (app/page.tsx):** «$12 в месяц» → «от 690 ₽ в месяц» (из конфига, в блоке сравнения); нижний блок «Всё это — от $12 в месяц» → мотивирующее «Перестань повторять одни и те же ошибки» + призыв. ($90 не было — это был $12.)

**Фича: покерный ник (показ вместо «Hero»).** Решение Артёма: ник ТОЛЬКО для показа (в LLM НЕ передаётся — приватность, правило 5), спрашиваем при регистрации, меняется в аккаунте.
- Схема: `Player.nickname String?` (миграция 20260622140000, накатана ВРУЧНУЮ в dev+test через db execute, как scheduled_plan_code).
- registerAction принимает nickname (norm, ≤40), форма регистрации — поле + подсказка; updateNicknameAction + раздел в /account; getCurrentPlayer отдаёт nickname; при закрытии аккаунта nickname → NULL (анонимизация).
- Показ: `lib/hero-name.ts` personalizeHero(text,nick) — замена /\bHero\b/g ТОЛЬКО при рендере; применено на странице раздачи (played/optimal/note/вопросы/вердикт/чат) и странице турнира (overview/moments). Вход LLM остаётся обезличен.
- 231 тест зелёный, tsc + build чистые.

**ЗАДЕПЛОЕНО НА ПРОД 2026-06-23** (push до 69d565c, автодеплой прошёл, ошибок нет). Перед push на проде накатили: `ALTER TABLE players ADD COLUMN IF NOT EXISTS nickname TEXT;` + в .env.production `EXCHANGE_RATE_PROVIDER=cbr` (через Yandex Cloud Shell на VM). Коммиты: fba9f9b (кредитная модель), e227711 (фикс лесенки), 4992d16 (ник), f67cc58 (доллары + юр-страница), 69d565c (контакт support@). Дальше — что внутри:

**Юр-страницы сведены в одну (2026-06-22):** 4 документа (оферта/политика ПДн/возврат/реквизиты) → одна страница `/legal` с оглавлением и якорями (#oferta/#privacy/#refund/#requisites); контент вынесен в `components/legal/*-content.tsx` (через git mv), старые роуты `/legal/{...}` удалены. Шрифт юр-текста меньше (P/LList → text-small). Подвал: одна ссылка «Документы» → /legal рядом с «© год». Ссылки в register-form → /legal#oferta,#privacy.

**Валюта: показ в $, оплата в ₽ по курсу ЦБ (решение Артёма 2026-06-22).** Цены $9/$20/$50 (config/plans.ts: amountKopecks → priceUsd; +formatUsd, +usdToKopecks). Курс — адаптер `adapters/exchange-rate/` (порт+cbr+fake, ЦБ cbr-xml-daily.ru, кэш на сутки, запасной курс из config/exchange-rate.ts USD_RUB_FALLBACK=95). Пересчёт $→₽ в момент оплаты в startCheckout/switchPlan/renew-step. Сверку суммы в apply-payment убрал (сумма зависит от курса). Показ $ на /pricing (+заметка «оплата в ₽ по курсу ЦБ») и главной; оферта обновлена. Тест currency.test (usdToKopecks/formatUsd/fake). 235 тестов зелёные.

**ПЕРЕД ДЕПЛОЕМ:**
1. На проде накатить колонку ника (новый код читает, иначе /register,/account,/tournament падают): `ALTER TABLE players ADD COLUMN IF NOT EXISTS nickname TEXT;` через шелл (доступ к VM через КЗ-релей-jump; как scheduled_plan_code, см. [[project_payments_yookassa]]).
2. В прод `.env`: `EXCHANGE_RATE_PROVIDER=cbr` (иначе курс = запасной фейк 95, а не живой ЦБ) + опц. `USD_RUB_FALLBACK`. Проверить, что сервер в КЗ/РФ достаёт cbr-xml-daily.ru.
3. ПОТОМ push (автодеплой ~5 мин).
