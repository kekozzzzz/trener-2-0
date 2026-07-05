---
name: deepseek-migration
description: "переход разбора на дешёвый DeepSeek (через OpenRouter через КЗ-релей); ЗАДЕПЛОЕНО 2026-06-28, LIVE (LLM_PROVIDER=openrouter)"
metadata: 
  node_type: memory
  type: project
  originSessionId: d2fedb85-eb78-4349-b94c-567c0d546340
---

Перевели ИИ-разбор с Sonnet на **DeepSeek** — в ~10-16× дешевле (турнир $0.40→$0.04-0.06, рука $0.035→$0.003). **ЗАДЕПЛОЕНО В ПРОД 2026-06-28, DeepSeek LIVE** (коммит 57fe423, LLM_PROVIDER=openrouter). Health зелёный, путь релей→OpenRouter подтверждён (200). **ОТКАТ:** убрать/сменить `LLM_PROVIDER` в `~/trener-2-0/trener/.env.production` + `pm2 restart trener` → назад на Sonnet за секунду; $15 Anthropic = топливо отката. План: `plans/2026-06-27-переход-на-дешёвую-модель.md` (+ `plans/2026-06-27-обогащение-фактов-парсера.md`).

⚠️ Деплой шёл бандлом через релей: GitHub-fetch с VM в тот момент НЕ работал (РФ-блок), `deploy.sh` падал на fetch. Метод обхода: `git bundle create /tmp/b 3683830..master` локально → scp через jump-релей → на VM `git fetch /tmp/b master && git reset --hard FETCH_HEAD` → `npx prisma generate && npm run build && pm2 restart trener`. Реальный env — `trener/.env.production` (приложение стартует из вложенной `trener-2-0/trener/`, не из корня). Голосовой STT тоже уехал в коде; на тот момент ключи STT не стояли. ОБНОВЛЕНО: голос LIVE с 2026-06-28 на Voxtral (тот же OPENROUTER_API_KEY) — см. [[project_voice_input_stt]].

**Архитектура (зафиксирована):** прод → казахский релей → OpenRouter → DeepSeek. Прямой выход из РФ в DeepSeek **флаки** (то 401 за 0.4с, то таймауты) — проверено с боевого сервера, поэтому релей ОСТАЁТСЯ. Anthropic/Sonnet — запасной, откат одним env-флагом `LLM_PROVIDER` без передеплоя; $15 на Anthropic = топливо отката (вывести нельзя). Прямой DeepSeek (минус ~5% комиссии OpenRouter) — отложен на «когда кредиты OpenRouter будут кончаться», нужна их регистрация (сайт у Артёма блокируется по DNS).

**Что сделано:** новый адаптер `infrastructure/adapters/llm/openrouter.ts` (LlmPort, OpenAI-формат, защита-повтор на кривой JSON); общие валидаторы вынесены в `parse.ts`; `getLlmProvider()`/OpenRouter-конфиг в `config/llm.ts`; цены DeepSeek в `config/llm-pricing.ts`. Парсер обогащён против галлюцинаций дешёвых моделей: готовая рука по улицам (`parser/made-hand.ts`), масти словами, блайнды везде, дро по улицам, «дро нет», состав стола. Промпт (`COACH_FRAMEWORK`): «суди по моменту, не по борду» + запрет капса/артефактов. tsc чист, 357 тестов зелёные.

**Осталось до выката:** ~~настроить nginx-релей на upstream к openrouter.ai~~ **СДЕЛАНО 2026-06-27** (в ходе голосового ввода [[voice-input-stt]]): на КЗ-релее добавлен `location /openrouter/` → `https://openrouter.ai/` (тот же секрет `x-proxy-secret`, что у Claude = `ANTHROPIC_PROXY_SECRET`; лимит тела 12m). Claude/Telegram не задеты (health зелёный). DeepSeek-адаптер должен ходить на **base url `https://92.60.75.87/openrouter`** с тем же секретом. Прямой OpenRouter с боевой VM флаки (7/20), релей обязателен. Осталось: финальная проверка; деплой по слову.

**Валидация:** прогнали 30+ реальных рук через DeepSeek — факты держит, вердикты совпадают с Sonnet, JSON стабильный. Ключ OpenRouter в `openrouter-key.txt` (в .gitignore, баланс ~$4.4 ≈ 80-100 турниров). Прогонные харнессы в `trener/__tests__/manual/` (гейт `RUN_MODEL_COMPARE=1`). Связано: [[project_llm_cost]], [[project_pricing_model]].
