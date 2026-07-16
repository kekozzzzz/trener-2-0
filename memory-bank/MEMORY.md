# Memory Index

## ⚠️ Правила, ломающие прод — читать первыми

- [🔴 Смотреть незапушенное ПЕРЕД пушем](feedback_check_unpushed_before_push.md) — push тащит ВСЮ ветку, не мой коммит: перед пушем `git log origin/master..master` и показать Артёму; инцидент 16.07 — «выкатывай» утащило на прод чужой WIP «НЕ деплоить»
- [🔴 Не деплоить во время разбора](feedback_no_deploy_during_analysis.md) — выкатка рестартит процесс → шаг диалога виснет в PROCESSING на 10 мин; инцидент 06.07
- [Деплой = пуш в master](project_remote_workspace.md) — сторож на КЗ-релее катит master на прод сам за ~2-4 мин; `[тихо]` в коммите глушит отчёты (только из локальной сессии); ⚠️не писать руками в /root/trener на релее — дерево автодеплоя
- [Серверные операции — сам](feedback_server_ops_self.md) — прод-операции Клод делает сам (SSH через релей); к прод-БД только на чтение
- [Уведомление ≠ задача](feedback_notification_not_task.md) — сторожа сообщают ФАКТ и останавливаются: без команд в тексте, без прогонов «на всякий»; решаем вместе за компом
- [Индекс памяти = суть, не статус](feedback_memory_sync.md) — в индекс «что это + где», статусы/даты/коммиты только в файле темы: статус гниёт молча и врёт следующей сессии (16.07 индекс врал про 4 записи); правь обе копии — локальную и memory-bank/
- [Всегда писать ретро](feedback_always_write_retrospective.md) — в конце КАЖДОЙ сессии в retrospectives/
- [Синхрон маркетинг-витрины](feedback_marketing_catalog_sync.md) — задел промпты/тарифы/функции → обнови 07-что-умеет-продукт.md в whygrid-marketing; из облака — сказать Артёму

## Как со мной разговаривать

- [Артём: покерный профиль](user_poker_profile.md) — микролимиты GGPoker, думающий игрок
- [Артём: не программист](user_programming_level.md) — ноль в программировании, объяснять просто
- [Только русский](feedback_russian_only.md) · [Живой диалог](feedback_genuine_dialogue.md) — не соглашаться автоматически, возражать по основаниям
- [Ответ после задачи](feedback_response_style.md) — итог в двух словах живым языком, без таблиц
- [Объяснять перед командами](feedback_explain_before_commands.md) · [Правки на лету](feedback_live_corrections.md) — правки скринами по ходу = рабочий режим, каждая в очередь
- [Стиль копирайта](feedback_copy_style.md) — живой язык, короткие тире, эталон hands/sliv-01.md · [Стиль названий](feedback_naming_style.md) — без транслита, без GG в имени
- [Язык карт](feedback_card_language.md) — «олл-ин» не «шов» · [Формат карточки](feedback_card_format.md) — адаптируется к сессии
- [Итеративный дизайн](feedback_design_iteration.md) — компоненты как есть, правки через /design-preview
- [Скорость — главный приоритет](feedback_speed_priority.md) — ожидание = уход пользователя; тяжёлое в предпосчёт/кэш
- [Не экономить на промптах](feedback_no_prompt_cost_cutting.md) · [Hardening перед деплоем](feedback_hardening_before_deploy.md) — после приёмки отдельный проход

## Мозг тренера и модели

- [🔴 A/B моделей](project_gemini_stream_breaks.md) — 16.07: смена модели НЕ решает, 2.5-flash и 3.1-flash-lite врут ОДИНАКОВО, оба «показывать нельзя»; болячки системные (ошибаются там, где факт ЕСТЬ, но надо ПРИМЕНИТЬ) → чек-листом не лечится, нужны СТОРОЖА — ЦИФРЫ В ФАЙЛЕ
- [GLM → Gemini](project_glm_latency_incident.md) — в бою Gemini 2.5 Flash (env OPENROUTER_MODEL, откат мгновенный); защиты от галлюцинаций LIVE; ⚠️правило: факт есть→в факт, нет→в чек-лист; чек-лист «ПЕРЕЧИТАЙ» РАЗДУТ — не пихать — ВСЁ В ФАЙЛЕ
- [Мозг тренера](project_trainer_brain_next.md) — COACH_FRAMEWORK в проде; хроника правок + чарты рестила и колла vs пуш — В ФАЙЛЕ
- [Каталог типов раздач](project_hand_type_catalog.md) — ⚠️16.07 случайно уехал на прод, СНЯТ revert'ом 9fe83f8 (вернуть = снять revert); копим к одному выкату; EV считать нечем (чарты бинарные) — ВСЁ В ФАЙЛЕ
- [Аудит — шум больше эффекта](feedback_audit_noise_baseline.md) — прогон НЕ приёмка по браку; годен для оценки ТОНА глазами; сравнивать брак — baseline в тот же час + 2-3 повтора
- [Регресс-прогон после правок промпта](feedback_prompt_regress_run.md) · [Прогонщик аудита](project_coach_audit.md) — локальный, вне git, HH из Test/audit/
- [Слежка за моделями](project_model_watch.md) — таймер на релее раз в 3 дня → Telegram; молчит, если новостей нет; следит и за пропажей/подорожанием боевой; LIVE 16.07
- [Теория покера](project_poker_theory_insights.md) — принципы из разборов, материал для промпта
- [Цены моделей, кэш и маржа](project_model_prices_and_cache.md) — замерено 16.07, НЕ перепроверять: себестоимость турнира и маржа тарифов; GLM/DeepSeek кэш 0%, gemini-3.1-flash-lite кэш 79% стабильно — ЦИФРЫ В ФАЙЛЕ
- [Стоимость LLM](project_llm_cost.md) — турнир ~$0.03–0.09; кэш промпта; учёт LlmUsage + /status · [DeepSeek migration](project_deepseek_migration.md) — откат флагом LLM_PROVIDER
- [Голосовой ввод](project_voice_input_stt.md) — Voxtral через релей; LIVE; учёт затрат в LlmUsage
- [Длина диалога](project_dynamic_dialogue_length.md) — 1..12 задаёт ИИ флагом complete

## Разборы: отбор раздач, метрики, память об игроке

- [Эталонные чарты](project_training_rfi_chart.md) — RFI (среднее чартов Артёма + публичных MTT 40bb); также [защита BB](project_bb_defense_chart.md), [vs опен](project_vpip_vs_raiser_chart.md), [пуш-фолд Nash](project_push_fold_chart.md), [изоляция](project_iso_vs_limp_chart.md) — все зашиты в config/, в проде
- [Твои чарты](project_personal_chart_memory.md) — зеркала всех 5 спотов, те же грейдеры; LIVE; коллы не судим; ⛔v2(дельта) отменён
- [Критические по решению](project_decision_critical_hands.md) — крупный фолд/блеф/недобор; decision-weight 5 каналов + квоты + движок веток; LIVE 11.07 — ДЕТАЛИ В ФАЙЛЕ
- [Критические по доезду](project_lucky_win_criticals.md) — вскрытые карты, эквити<33% при крупном вложении; LIVE 04.07; только новые загрузки
- [Трекер ликов](project_leak_tracker.md) — динамика между игровыми днями, 9 детекторов, без LLM; LIVE; блоки в UI спрятаны
- [Цель на сессию](project_session_goal.md) — из топ-лика окна; /charts публичная + SEO + CTA; блок цели убран со страниц («вернём» — Артём)
- [Память об игроке](project_trainer_spot_memory.md) — отпечаток спота + похожие раздачи + карточка ученика + дневник coach_notes; ВСЯ LIVE — ДЕТАЛИ В ФАЙЛЕ
- [Ориентир (self-level)](project_self_level_orientir.md) — самооценка уровня, мягкий приор ТОЛЬКО на тон, затухает; LIVE 11.07
- [Профиль соперника](project_opponent_profiling.md) — парсер типизирует, ИИ подстраивает, игроку не показываем; псевдонимы oppN; LIVE
- [Сетка диапазона + глоссарий](project_opponent_range_grid.md) · [Движок эквити](project_range_engine.md) — точное эквити против диапазона с сетки
- [Ауты и дро](project_clean_outs_draws.md) — грязные ауты/бэкдоры/эквити перебором + запрет выдумывать ауты
- [Размер ставки и лимпы](project_betsizing_and_limps.md) · [Лик по открывашкам](project_open_leak_and_inline_links.md) · [Характеристика игрока](project_player_characteristic.md) — от 10 турниров
- [Тренажёр префлопа](project_training_mode.md) — случайные споты, сверка с чартом без LLM; план в plans/
- [Экран прогресса](project_analysis_progress_screen.md) · [Маркер «просмотрено»](project_viewed_marker.md) — критические диалоги до вердикта = пройден
- [Зависший диалог](project_dialogue_hang_empty_question.md) — баг 15.07 пустого вопроса; фикс; КАК разблокировать в прод-БД — В ФАЙЛЕ
- [Вечная крутилка](project_stuck_step_recovery.md) — шаг в карантине больше не крутит «готовим…» бесконечно: показывает «не получилось, повторить» + кнопка перезапуска; задеплоено
- [Удаление турнира](project_tournament_delete.md) — в UI НЕ делаем (решение Артёма); отбор фиксируется при загрузке; КАК soft-delete вручную — В ФАЙЛЕ
- [Профит/призовые](project_tournament_results_data.md) — БУДУЩЕЕ: инлайн только у PS, остальным нужен файл-сводка

## Парсеры румов

- [PS-семья](project_winamax_888_ps_parsers.md) — Winamax/888/PokerStars + сторож diagnose + S3 нераспознанных; сюда же [Chico и iPoker](project_ipoker_chico_parsers.md) и [PokerPlanets](project_pokerplanets_parser.md) (клон PS, задеплоен 9d9e1bc, гайд ru+en); ⛔убрать app/chart-real
- [WPN](project_wpn_parser.md) — ACR/PokerKing + роутер + мердж многостольных файлов; образцы Test/samples/wpn/
- [Тестовые HH](project_test_hh_file.md) — Test/ = реальные файлы вне git (GG/PS/WMX/888/Chico/iPoker/WPN)
- [Гайд загрузки](project_upload_guide_screenshots.md) — скрины по всем румам в подсказке (кроме Chico); шаги Winamax под новый клиент

## Инфраструктура, деплой, мониторинг

- [Рабочее место / автодеплой](project_remote_workspace.md) — работа с планшета, вкладка «Код»; сторож автодеплоя на релее; ⚠️починки автодеплоя живут ТОЛЬКО на релее, в git их нет — ДЕТАЛИ В ФАЙЛЕ
- [Процедура деплоя](project_deploy_procedure.md) — ⚠️ВМ из РФ GitHub не достаёт: только бандл через КЗ-релей → merge → build → pm2 restart; [статус](project_deploy_status.md) — whygrid.app через релей, ❗серт до 2026-09-20
- [LLM из РФ](project_llm_connectivity_block.md) — РЕШЕНО: через релей-nginx (Казахстан) · [Зависание деплоя](project_deploy_pipeline_hang.md) — git fetch без таймаута; фикс
- [Бот-сторож](project_watchdog_bot.md) — тревога при карантине задачи + утренний дайджест; @kekoz_bot · [Telegram-мост](project_telegram_bridge.md) — управление с телефона, мост на релее 24/7
- [Мониторинг здоровья](project_health_monitoring.md) — /api/health + UptimeRobot; серт следим сами
- [Очередь](project_queue_latency.md) — concurrency 10; узкое место — сама LLM · [Рычаги масштабирования](project_scaling_triggers.md) — №1 параллельный воркер
- [Админка](project_admin_stats.md) — /admin владельцу: регистрации/входы/страны; ⚠️prisma migrate dev портит ручные partial-индексы — SQL чистить руками
- [Лимит загрузки nginx](project_nginx_upload_limit.md) — client_max_body_size 50m на обоих; осталось global-error.tsx
- [База](project_db_setup.md) — PostgreSQL 17 локально, trener_dev · [Инфра-roadmap](project_infra_roadmap.md) — переезд ~лето 2027 → Hetzner+Stripe+R2
- [Бот-постинг](project_posting_bot.md) — @whygrid_bot; ждёт перевыпуск токена + админство в канале

## Деньги, доступ, юр

- [Тарифы](project_pricing_model.md) — LIVE с 11.07: $7/25 разборов и $21/«безлимит» (fair-use 300), $45 скрыт; ленивый разбор по клику; гейт ВКЛ
- [ЮKassa](project_payments_yookassa.md) — LIVE, вебхук, возвраты, крон renew ([чек-лист go-live закрыт](project_yookassa_golive.md)); осталось юр-флаги РКН/трансгранич.
- [Продления инфраструктуры](project_recurring_payments.md) — 🔴релей VDSka, Yandex грант до 08.08→MIR, Porkbun до 2027-06-19 · [Крипта](project_crypto_payments_later.md) — отложено до переезда
- [Ключи и биллинг LLM](project_payments_blocked.md) — биллинг Anthropic настроен, ключ на проде стоит (Anthropic = запасной, в бою OpenRouter)
- [Вход по magic link](project_magic_link_auth.md) — passwordless, /enter первичный; LIVE · [Доступ владельца](project_owner_comp_access.md) — admin-байпас; тестер zebster@bk.ru
- [Загрузка без блока](project_upload_no_block_locked_analysis.md) — грузи сколько угодно, разбор у первого бесплатного; автостарт при открытии турнира
- [Почта](project_email_and_reset.md) — Unisender Go, 4 письма + крон; LIVE · [support@](project_support_mailbox.md) — Cloudflare Routing, ❗при переезде пересобрать · [Форма поддержки](project_support_form.md) — /support → Telegram; осталось hardening
- [Юр-статус](project_legal_status.md) — самозанятость оформлена, юр-страницы LIVE
- [English](project_i18n_english.md) — UI+письма+тренер LIVE; легалка русская; приёмка англ. тренера ОТЛОЖЕНА — НЕ напоминать
- [SEO](project_seo_metadata.md) — описания+robots+sitemap LIVE; favicon ждёт логотипа

## Маркетинг и бренд

- [🔴 Где НЕЛЬЗЯ постить](project_distribution_constraint.md) — GipsyTeam и покерные форумы/чаты официально запрещают «тестирую продукт / вот мой инструмент» даже с оговоркой «не реклама»; Артём спрашивал поддержку — исключений нет, его там уже банили. Можно быть участником без продвижения. Наше самоограничение «только знакомые» СНЯТО, политика площадок — НЕТ
- [Маркетинг](project_marketing.md) — бюджет $300; Директ/VK нельзя (покер в стоп-листе); видео/YouTube отложены (Артём без лица/голоса — НЕ предлагать); контент = ТГ + статьи
- [Репо для маркетолога](project_marketing_partner_repo.md) — отдельный приватный whygrid-marketing (БЕЗ кода); доступ ещё НЕ выдан
- [Комьюнити-чат](project_community_chat_growth.md) — ЧЕРНОВИК привлечения (НЕ одобрено): чат + открытый бот-раздатчик разборов
- [Имя и бренд](project_naming_branding.md) — Whygrid, логотип концепт B; ребрендинг кода впереди

## Разное

- [Звук уведомлений](reference_sound_notifications.md) — хуки в глобальном settings.json; как менять/убрать
- [Диск C / NVIDIA](user_disk_c_nvidia_bloat.md) — NVIDIA копит драйверы (77 ГБ/год); rm -rf в deny-листе — спрашивать; 10.07 освобождено 80 ГБ

<!-- Архив (свершилось, держим для истории, в работе не нужно):
     project_validation_test.md — план теста спроса по $12/мес; цены давно $7/$21, тест не проводился
     project_launch_decision.md — решение делать самосервисный сайт; Запрет 6 отменён, сайт работает -->
