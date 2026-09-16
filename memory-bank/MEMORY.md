# Memory Index

## ⚠️ Правила, которые ломают прод и доверие — читать первыми

- [🔴 Не выдавать догадку за факт](feedback_save_facts_immediately.md) — проверил → сразу в конфиг И в память; вывод ≠ факт
- [🔴 Новый факт — проверь ОБРАТНЫЙ случай](feedback_new_fact_check_negative_case.md) — прямой И обратный тест к каждому факту
- [🔴 «Вес решения» ≠ выигрыш](feedback_weight_bb_not_result.md) — цифру в текст только из реального HH-файла, не из шапки-источника
- [🔴 Смотреть незапушенное ПЕРЕД пушем](feedback_check_unpushed_before_push.md) — `git log origin/master..master` и показать Артёму; push тащит всю ветку
- [🔴 Не деплоить во время разбора](feedback_no_deploy_during_analysis.md) — выкатка рестартит процесс, шаг диалога виснет
- [Деплой = пуш в master](project_remote_workspace.md) — сторож на релее катит сам за ~2-4 мин; `[тихо]` глушит отчёты
- [Серверные операции — сам](feedback_server_ops_self.md) — прод-операции через SSH-релей; к прод-БД только на чтение
- [Уведомление ≠ задача](feedback_notification_not_task.md) — сторожа сообщают факт и останавливаются
- [Индекс памяти = суть, не статус](feedback_memory_sync.md) — статусы только в файле темы; правь обе копии (и memory-bank/)
- [Сверка копий памяти](project_memory_copies_divergence.md) — ✅сведены 21.08 (0 расхождений, 157/157 файлов); метод+скрипт для повторной сверки, когда снова разъедутся
- [Всегда писать ретро](feedback_always_write_retrospective.md) — в конце КАЖДОЙ сессии
- [⛔ Соседние репозитории не трогаем](feedback_marketing_catalog_sync.md) — синхрон витрины отменён; понадобится — Артём скажет
- [Новый проект = новая сессия](feedback_separate_project_sessions.md) — не вести содержательную работу по несвязанному проекту в текущем чате
- [🔴 curl не проверяет Server Actions Next.js](feedback_nextjs_server_action_curl_unreliable.md) — тот же HTTP-ответ, но побочный эффект (запись в БД) может тихо не случиться; проверять браузером или тестом на саму функцию

## Как со мной разговаривать

- [Артём: покерный профиль](user_poker_profile.md) · [не программист](user_programming_level.md) — объяснять просто
- [Только русский](feedback_russian_only.md) · [Живой диалог](feedback_genuine_dialogue.md) — возражать по основаниям
- [Ответ после задачи](feedback_response_style.md) — живым языком, без таблиц
- [Объяснять перед командами](feedback_explain_before_commands.md) · [Правки на лету](feedback_live_corrections.md) — скрины по ходу
- [Стиль копирайта](feedback_copy_style.md) · [Стиль названий](feedback_naming_style.md) — без транслита, без GG в имени
- [Язык карт](feedback_card_language.md) — «олл-ин» не «шов» · [Формат карточки](feedback_card_format.md)
- [Итеративный дизайн](feedback_design_iteration.md) — правки через /design-preview
- [🔴 Сверяй с кодом РЕАЛЬНОЙ страницы](feedback_verify_against_real_product_page.md) — не переиспользуй похожий маркетинговый компонент вместо настоящего UI
- [Номера клипов в структуре](feedback_clip_numbers_in_structure.md) — всегда «название (номер)» из all-clips/index.md
- [Скорость — главный приоритет](feedback_speed_priority.md) — ожидание = уход пользователя
- [Не экономить на промптах](feedback_no_prompt_cost_cutting.md) · [Hardening перед деплоем](feedback_hardening_before_deploy.md)
- [🔴 ИИ-видео не читает карты](feedback_ai_video_no_legible_cards.md) — для карт hand-board.html, не Seedance
- [Выбор видео-модели](project_video_model_choice.md) — дефолт Veo 3.1 Lite $0.30/6с; ⛔Seedance 2.5 дороже вчетверо; картинку первым кадром принимают ВСЕ модели

## Инструменты и среда

- [🔴 ffmpeg: нужен -pix_fmt yuv420p](reference_ffmpeg_pixfmt_yuv444_bug.md) — иначе видео не открывается, `format=` не спасает
- [🔴 Playwright: скриншоты в этой среде ненадёжны](reference_playwright_screenshot_viewport_bug.md) — DPR 0.9 сдвигает кадр; `target`/`clip` иногда пустой чёрный кадр — рабочий фикс: viewport-скрин после ручного scrollTo
- [🔴 IntersectionObserver ненадёжен для узкой зоны](reference_scroll_zone_intersectionobserver_unreliable.md) — колбэки опаздывают/пропускаются при обычном скролле; фикс — rAF + getBoundingClientRect напрямую
- [📌 Параллельная сессия в trener/ ломает dev-сервер и браузер](reference_parallel_session_dev_collision.md) — общий `.next` кэш → 404 на чанках; общий профиль Playwright блокируется — не убивать chrome.exe скопом

## Мозг тренера и модели

- [🔴 A/B моделей](project_gemini_stream_breaks.md) — смена модели НЕ решает, болячки системные → нужны СТОРОЖА
- [GLM → Gemini](project_glm_latency_incident.md) — 🟢в бою gemini-3.1-flash-lite, откат флагом OPENROUTER_MODEL
- [Мозг тренера](project_trainer_brain_next.md) — COACH_FRAMEWORK в проде · [Каталог типов раздач](project_hand_type_catalog.md) — ⚠️снят revert'ом 9fe83f8
- [Дыры в промпте, не модель](project_prompt_holes_fixed.md) — 13 правок 17.07: вранье 39%→8%; урок — промпт-просьба не работает, работает код/факт
- [Аудит — шум больше эффекта](feedback_audit_noise_baseline.md) — прогон НЕ приёмка по браку, годен для оценки ТОНА
- [🔴 Эталонный прогон с ЧИСЛАМИ](project_benchmark_runner.md) — `RUN_BENCHMARK=1`, метрики считает код; новый сторож гонять ДО деплоя
- [Регресс-прогон после правок](feedback_prompt_regress_run.md) · [Прогонщик аудита](project_coach_audit.md) — вне git, HH из Test/audit/
- [Эталон регресс-раздач](project_regression_hand_benchmark.md) — ✅60 файлов (GG+iPoker) в git, проверены на уровне парсера
- [📌 Кандидат: Gemini 3.5 Flash-Lite](project_model_candidate_gemini_35_flash_lite.md) · [📌 Qwen 3.7 Flash](project_model_candidate_qwen_37_flash.md) — резерв, НЕ переключать
- [⛔ Отклонён: Haiku 4.5](project_model_candidate_haiku_45.md) — НЕ предлагать, подтверждено Артёмом
- [Слежка за моделями](project_model_watch.md) — таймер на релее раз в 3 дня → Telegram
- [🔑 «Ложный натс» — врал ПАРСЕР](project_false_nuts_parser_lied.md) — натсовость мерилась внутри категории; ⛔сторож на слово «натс» нельзя
- [Теория покера](project_poker_theory_insights.md) — принципы из разборов, материал для промпта
- [✅ Модель, цены, скорость](project_model_prices_and_cache.md) — ВСЕ ЦИФРЫ В ФАЙЛЕ, не перепроверять
- [Стоимость LLM](project_llm_cost.md) — турнир ~$0.03–0.09; кэш промпта · [DeepSeek migration](project_deepseek_migration.md)
- [Голосовой ввод](project_voice_input_stt.md) — Voxtral через релей · [Длина диалога](project_dynamic_dialogue_length.md) — 1..12, флаг complete

## Разборы: отбор раздач, метрики, память об игроке

- [Чарты](project_training_rfi_chart.md) — RFI, [BB](project_bb_defense_chart.md), [vs опен](project_vpip_vs_raiser_chart.md), [пуш-фолд](project_push_fold_chart.md), [изоляция](project_iso_vs_limp_chart.md); в проде
- [Твои чарты](project_personal_chart_memory.md) — зеркала 5 спотов; коллы не судим; ⛔v2 отменён
- [Критические по решению](project_decision_critical_hands.md) — decision-weight, 5 каналов + квоты; LIVE
- [Критические по доезду](project_lucky_win_criticals.md) — эквити<33% при крупном вложении; LIVE
- [Трекер ликов](project_leak_tracker.md) — 8 видов без LLM, расчёт LIVE и работает; UI-блок на /tournaments спрятан (решение Артёма 04.07, код цел)
- [Цель на сессию](project_session_goal.md) — /charts публичная + SEO; блок цели убран со страниц
- [Память об игроке](project_trainer_spot_memory.md) — отпечаток спота, похожие раздачи, карточка, дневник; LIVE
- [Ориентир (self-level)](project_self_level_orientir.md) — мягкий приор только на тон; LIVE
- [Профиль соперника](project_opponent_profiling.md) — псевдонимы oppN, игроку не показываем; LIVE
- [Сетка диапазона](project_opponent_range_grid.md) · [Движок эквити](project_range_engine.md) — точное эквити с сетки
- [Эталонный диапазон 3-бета](project_estimated_3bet_range.md) — запасной факт; KQo vs AA=12.7% проверено
- [Ауты и дро](project_clean_outs_draws.md) — грязные ауты и бэкдоры перебором
- [Размер ставки и лимпы](project_betsizing_and_limps.md) · [Лик по открывашкам](project_open_leak_and_inline_links.md) · [Характеристика игрока](project_player_characteristic.md)
- [Тренажёр префлопа](project_training_mode.md) — сверка с чартом без LLM · [Экран прогресса](project_analysis_progress_screen.md) · [Маркер «просмотрено»](project_viewed_marker.md)
- [Зависший диалог](project_dialogue_hang_empty_question.md) — баг пустого вопроса · [Вечная крутилка](project_stuck_step_recovery.md) — «повторить» + перезапуск
- [Удаление турнира](project_tournament_delete.md) — в UI НЕ делаем · [Профит/призовые](project_tournament_results_data.md) — БУДУЩЕЕ, инлайн только у PS

## Парсеры румов

- [🔴 Колл ва-банк ≠ пуш](project_allin_call_vs_push.md) — критерий в parser/aggression.ts, руками не трогать
- [PS-семья](project_winamax_888_ps_parsers.md) — Winamax/888/PS + [Chico, iPoker](project_ipoker_chico_parsers.md) + [PokerPlanets](project_pokerplanets_parser.md); ⛔убрать app/chart-real
- [WPN](project_wpn_parser.md) — ACR/PokerKing + роутер + мердж многостольных
- [Тестовые HH](project_test_hh_file.md) — Test/ = реальные файлы вне git
- [Гайд загрузки](project_upload_guide_screenshots.md) — скрины по всем румам (кроме Chico)

## Инфраструктура, деплой, мониторинг

- [Рабочее место / автодеплой](project_remote_workspace.md) — ⚠️починки живут ТОЛЬКО на релее, в git их нет; 🔴16.09 починен молчаливый застрой при новом npm-пакете (dirty lockfile на ВМ)
- [Процедура деплоя](project_deploy_procedure.md) — 🔴health зелёный ≠ выкат доехал, сверять коммит на ВМ; [статус](project_deploy_status.md) — ❗серт до 2026-09-20
- [🔴 Ложные алерты при выкате](project_deploy_alert_noise.md) — сторож бил тревогу с ПЕРВОЙ неудачи; починено 08.08
- [📌 Ночные обрывы сети у релея](project_relay_nightly_outage.md) — 2 ночи подряд ~1.5ч, сеть релея не VM; дайджест «failed» = задумано, не баг
- [🔴 ВМ зависала 9ч (20.08)](project_vm_hang_incident_20260820.md) — pm2-автозапуск починен, лёгкий auto-heal в load-watchdog.sh; полный auto-reboot отложен до повтора
- [LLM из РФ](project_llm_connectivity_block.md) — решено через релей-nginx · [Зависание деплоя](project_deploy_pipeline_hang.md) — фикс
- [Бот-сторож](project_watchdog_bot.md) — карантин + дайджест · [Telegram-мост](project_telegram_bridge.md) — на релее
- [📦 Фреймворк AI-Кофаундер](reference_ai_cofounder_framework.md) — Desktop, куплен 14.08; готовые промпты для авто-отчётов/триажа, брать при надобности, не разворачивать
- [Мониторинг здоровья](project_health_monitoring.md) — /api/health + UptimeRobot; серт следим сами
- [Очередь](project_queue_latency.md) — concurrency 10 · [Рычаги масштабирования](project_scaling_triggers.md) — №1 параллельный воркер
- [✅ Аудит внешней утечки](project_security_audit_external_leak.md) — 16-17.08 дыр нет; бакет HH проверен вручную, закрыт; риск на будущее — нет центрального гейта авторизации
- [Админка](project_admin_stats.md) — ⚠️prisma migrate dev портит ручные partial-индексы; 📌 владелец исключён из «Входы»/«Заходы», не запушено
- [Лимит загрузки nginx](project_nginx_upload_limit.md) — 50m на обоих; осталось global-error.tsx
- [Страница техработ при падении](project_maintenance_page.md) — nginx error_page 502/503/504 на релее+ВМ; ✅проверено на ВМ, релей не fault-injected
- [База](project_db_setup.md) — PostgreSQL 17 · [Инфра-roadmap](project_infra_roadmap.md) — ~2027 на Hetzner · [Бот-постинг](project_posting_bot.md) — ждёт токен

## Деньги, доступ, юр

- [Тарифы](project_pricing_model.md) — $7/25 и $28/безлимит (fair-use 300); бесплатный лимит 1
- [Сегменты аудитории](project_audience_segments.md) — витрина без лимитов, ⚠️промпты и чарты остаются под микролимиты
- [ЮKassa](project_payments_yookassa.md) — LIVE ([go-live закрыт](project_yookassa_golive.md)); осталось юр-флаги РКН
- [Продления инфраструктуры](project_recurring_payments.md) — 🔴релей, Yandex грант, домен, Unisender 800₽/мес до 20.09 · [Крипта](project_crypto_payments_later.md) — отложено
- [Ключи и биллинг LLM](project_payments_blocked.md) — Anthropic запасной, в бою OpenRouter
- [Magic link](project_magic_link_auth.md) · [Доступ владельца](project_owner_comp_access.md) — admin-байпас
- [Загрузка без блока](project_upload_no_block_locked_analysis.md) — разбор у первого бесплатного
- [🔴 Почта](project_email_and_reset.md) — с 16.09 SMTP через support@ основной, Unisender запасной · [support@](project_support_mailbox.md) — ❗при переезде пересобрать · [Форма поддержки](project_support_form.md) — ждёт hardening
- [🔴 mail.ru SMTP: From = логин аутентификации](reference_mailru_smtp_from_must_match_auth.md) — 501 sender address must match authenticated user, иначе; веб-интерфейса не касается
- [Юр-статус](project_legal_status.md) — самозанятость, страницы LIVE · [SEO](project_seo_metadata.md) — техника ОК, причина невидимости = 0 бэклинков; гайд-кластер перелинкован и задеплоен; vc.ru — только идея в бэклоге, не черновик
- [English](project_i18n_english.md) — UI+письма+тренер LIVE; приёмка англ. тренера ОТЛОЖЕНА, не напоминать

## Маркетинг и бренд

- [Доверие холодной аудитории](project_trust_mechanics.md) — LIVE: about/example/uptime/changelog/гарантия точности/приватность-сигналы (19.08); ⛔осознанно отклонено: money-back, публичный roadmap, Hendon-Mob-аналог
- [Сканирующая подсветка при скролле](project_scroll_highlight_feature.md) — LIVE на главной, два уровня (аура/рамка), переиспользуемый проп scrollGlow
- [Источники переходов](project_acquisition_sources.md) — `/go/<source>` + счётчик
- [⛔ YouTube: ссылки пока не кликабельны](project_youtube_link_restriction.md) — ни в описании, ни в комментах; ждём порог канала, не предлагать закреп-коммент снова
- [Выводы по Shorts](project_youtube_shorts_analytics_findings.md) — удержание и RU-аудитория растут по датам; 12.09: RFI лучший на Instagram/худший на YouTube — reach ≠ resonance даже между площадками
- [🔴 Хук — одно правило на обе площадки](feedback_hook_first_seconds_universal.md) — конкретный факт в первые 1-3 сек чинит и пропуски в Instagram, и обрыв кривой на YouTube
- [Где искать графики удержания](reference_analytics_graph_locations.md) — Instagram: «Вовлечённость»; YouTube: НЕ «Обзор», а «Взаимодействие»; свежему ролику графика ещё нет
- [🔴 Креатив для Reels — автономно](feedback_marketing_content_autonomy.md) — сценарии и хуки сам; деньги и публикация — с подтверждением
- [🔴 Отбор раздач для контента](feedback_hand_selection_criteria.md) — по сюжету и выводу, не по топу веса
- [🔴 Outreach — только через поддержку](feedback_outreach_no_personal_contact.md) — никогда лично известным людям, только официальный канал организации
- [Результат ≠ решение в копирайте](feedback_result_vs_decision_framing.md) — не «где теряешь фишки» (это результат раздачи), а «где решение слабее» (паттерн, не судим по доезду/недобору)
- [🔴 Называть накопленную сумму перед тратой](feedback_running_total_before_spend.md) — особый риск батч-генерации
- [Название Shorts отдельно от описания](feedback_youtube_shorts_title.md) — всегда ДВА текста
- [🔴 Подпись ≠ пересказ ролика](feedback_caption_not_script_retelling.md) — не цитировать сценарий, крючок а не краткое содержание
- [Ссылка не в каждом посте](feedback_telegram_link_frequency.md) — каждый 3-й; «Один вопрос» никогда
- [🔴 Темп монтажа Reels](feedback_reel_video_pacing.md) — длина клипа зависит от длины ролика: короткий — длинные планы, ~30с+ — по 1.5-2с; не стоп-кадр в конце
- [Полный конвейер текст→видео](project_caption_automation_choice.md) — orchestrate.mjs, не Descript/Submagic/CapCut; Артём всё равно смотрит каждый ролик перед публикацией
- [Рилз «твои лимиты»](project_reel_your_stakes.md) — 04.09, тема микролимитных МТТ (не хайроллеры), 11 раундов правок по фактам, финал v11
- [14 приёмов из референсов → код](project_remotion_reference_techniques_2026_09_04.md) — BuildUp/GhostWord/PointerIcon + grow/outline/type/boxed/elegant в PhraseBeat; референсы оказались НАШИМИ роликами; ⚠️ГЛУБОКАЯ история компонентов (v1-v18 decision-weight, 02-03.09) НЕ синхронизирована в этот файл — есть только в локальной памяти сессии на компьютере Артёма
- [🔊 Умею слушать звук](project_audio_listening_capability.md) — `listen-audio.mjs`, OpenRouter+Gemini, доли цента за прогон; надёжно на КОРОТКИХ изолированных отрезках, ненадёжно на цельном ролике
- [🔴 Музыка: без слов, с "разыгранного" момента](feedback_music_selection_criteria.md) — trimBefore пропускает тихое вступление, тайминги битов пересчитывать под сдвиг
- [🔴 Не называть один рум](feedback_no_single_room_branding.md) — продукт мультирумный, GGPoker убрать из рекламных текстов
- [Сетки safe zone Reels/Shorts](reference_reels_safe_zone_grid.md) — точные цифры из интернета; риск: правая колонка иконок в НИЖНЕЙ трети кадра
- [Piratex — что взято/отложено](project_piratex_reference.md) — приёмы хука+самопроверки в copywriting.md; анализ конкурентов и Apify-тренды ждут Артёма
- [Идея: сводный отчёт по всей истории](project_full_history_report_idea.md) — вдохновлён конкурентом Baseanalise; НЕ план, требует отдельного обсуждения
- [Проактивно называть мусор](feedback_flag_unused_marketing_files.md) — удалять только по команде
- [all-clips/ = единственный источник](project_allclips_canonical_folder.md) — оригиналы stock-video не трогать
- [Бесплатные стоки: Mixkit/Pexels](project_stock_video_free_sources.md) — Mixkit Free/Restricted по 1080p; Pexels 18.08 заработал из среды агента (WebFetch+curl с UA)
- [Номера клипов по дням](feedback_track_clip_usage_by_number.md) — фиксировать в index.md
- [📌 Файлы в generated/ пропадали](project_marketing_generated_files_vanish.md) — причина не найдена
- [Где можно/нельзя постить](project_distribution_constraint.md) — GipsyTeam ОК с одобрения (пост live 19.08); 🔴 vc.ru закрыт навсегда — забанили за тему «азартные игры»
- [Маркетинг](project_marketing.md) — бюджет $300, Директ/VK нельзя; ⛔TikTok закрыт целиком 15.08 (не предлагать); 📌 Reels → `.business/marketing/reels-handoff-status.md`
- [🔄 Пивот на рекламу](project_ad_reel_pivot.md) — 07.08: сюжетные Reels на паузу, короткая прямая реклама продукта до появления аудитории
- [Репо для маркетолога](project_marketing_partner_repo.md) — доступ ещё НЕ выдан
- [Комьюнити-чат](project_community_chat_growth.md) — ЧЕРНОВИК · [Имя и бренд](project_naming_branding.md) — Whygrid, логотип концепт B

## Разное

- [Звук уведомлений](reference_sound_notifications.md) — хуки в settings.json · [Диск C / NVIDIA](user_disk_c_nvidia_bloat.md) — копит драйверы, rm -rf в deny

<!-- Архив (свершилось, в работе не нужно):
     project_validation_test.md — план теста спроса по $12/мес; цены давно $7/$21
     project_launch_decision.md — решение делать самосервисный сайт; Запрет 6 отменён -->
