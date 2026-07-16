#!/usr/bin/env node
// Сторож новых моделей OpenRouter. Работает НА РЕЛЕЕ (Казахстан) по таймеру systemd
// раз в трое суток: тянет каталог openrouter.ai, сравнивает со снимком прошлой проверки
// и пишет Артёму в Telegram — только когда есть о чём. Тишина = ничего не изменилось.
//
// Почему на релее, а не на проде: ВМ в РФ до openrouter.ai и api.telegram.org напрямую
// не достаёт, релей достаёт — тем же каналом, что автодеплой и сторож дайджеста.
// Почему не в сессии Клода: сессия закрывается вместе с ноутбуком, а слежка должна жить.
//
// О чём пишет (решение Артёма 2026-07-16):
//   🔴 тревога   — боевая модель пропала из каталога или подорожала → прод под ударом;
//   🆕 новинка   — вышла модель известной лаборатории, проходящая по цене и контексту;
//   📋 к сведению — крупный релиз, который нам не по деньгам (одной строкой).
//
// ВАЖНО — это УВЕДОМЛЕНИЕ, а не задача (уточнение Артёма 2026-07-16). Сторож сообщает
// факт «вышло вот это» и на том останавливается: ни аудита, ни пробного прогона, ни даже
// команды для него в тексте. Менять ли модель — Артём решает с Клодом за компьютером,
// глядя на конкретную новинку. Причина: любой намёк на «прогони» в сообщении приводит к
// прогонам по моделям, которые нам заведомо не нужны, — это трата времени и денег.
//
// Запуск руками: node watch.mjs --dry-run   → печатает отчёт в консоль, ничего не шлёт
//                                              и не трогает снимок.

import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { CONFIG } from "./config.mjs";

const STATE_PATH = process.env.MODEL_WATCH_STATE || "/root/.model-watch.json";
const CATALOG_URL = "https://openrouter.ai/api/v1/models";
const CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || "440359604";
const DRY = process.argv.includes("--dry-run");

const perM = (v) => Number(v) * 1e6;
const usd = (v) => `$${v.toFixed(2)}`;
const price = (m) => `${usd(m.in)}/${usd(m.out)} за млн`;
const vendorOf = (id) => id.split("/")[0];
const ctx = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(0)}M` : `${Math.round(n / 1000)}k`);

// Сколько строк «к сведению» показываем. Один релиз лаборатории приезжает пачкой
// вариантов (gpt-5.6 luna/terra/sol × pro — шесть строк об одном событии), а это раздел
// «просто знать», не список дел. Показываем самые дешёвые — они ближе всего к нам.
const FYI_LIMIT = 6;

// Всё, за чем следим: боевая модель + запасные/откатные.
const WATCHED = [CONFIG.prodModel, ...CONFIG.alsoWatched];

// ───────────────────────────── каталог ─────────────────────────────

async function fetchCatalog() {
  const r = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`OpenRouter ответил ${r.status}`);
  const json = await r.json();
  // Оградка: если каталог пришёл огрызком (сбой на их стороне, страница-заглушка),
  // молча выходим и НЕ перезаписываем снимок. Иначе следующая проверка сочтёт
  // все 300+ моделей новыми и завалит Артёма мусором.
  if (!Array.isArray(json.data) || json.data.length < 50) {
    throw new Error(`каталог подозрительно короткий (${json?.data?.length ?? "нет data"})`);
  }
  return json.data;
}

function snapshot(catalog) {
  const out = {};
  for (const m of catalog) {
    out[m.id] = { in: perM(m.pricing?.prompt), out: perM(m.pricing?.completion) };
  }
  return out;
}

// ───────────────────────────── фильтр ─────────────────────────────

// Модель вообще из тех, что мы могли бы поставить тренеру: текст→текст, известная
// лаборатория, не алиас и не бесплатный дубль с лимитами.
function isRelevant(m) {
  if (m.id.startsWith("~")) return false; // алиас (~x-ai/grok-latest) — дубль настоящей
  if (m.id.endsWith(":free")) return false; // бесплатный дубль: рейт-лимиты, для прода не годится
  if (!CONFIG.vendors.includes(vendorOf(m.id))) return false;
  if (CONFIG.excludeIdPattern.test(m.id)) return false;
  const outMod = m.architecture?.output_modalities ?? [];
  if (outMod.length !== 1 || outMod[0] !== "text") return false;
  const i = perM(m.pricing?.prompt);
  const o = perM(m.pricing?.completion);
  if (!Number.isFinite(i) || !Number.isFinite(o) || i < 0 || o < 0) return false; // openrouter/fusion отдаёт минусы
  return true;
}

// Проходит по деньгам и контексту → это кандидат на аудит-прогон.
function isAffordable(m) {
  if ((m.context_length || 0) < CONFIG.minContext) return false;
  return (
    perM(m.pricing?.prompt) <= CONFIG.maxInputUsdPerM &&
    perM(m.pricing?.completion) <= CONFIG.maxOutputUsdPerM
  );
}

// ───────────────────────────── отчёт ─────────────────────────────

function buildReport(catalog, prev) {
  const now = snapshot(catalog);
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const alarms = [];
  const candidates = [];
  const fyi = [];

  // 1. Боевые модели — то, на чём прод стоит прямо сейчас.
  for (const id of WATCHED) {
    const cur = now[id];
    if (!cur) {
      alarms.push(
        id === CONFIG.prodModel
          ? `🔴 БОЕВАЯ модель ${id} ПРОПАЛА из каталога OpenRouter — разбор на проде вот-вот ляжет. Нужен откат: env OPENROUTER_MODEL на ВМ, запасная ${CONFIG.alsoWatched[0]}.`
          : `🔴 ${id} пропала из каталога OpenRouter. Прод работает (боевая — ${CONFIG.prodModel}), но путь отката на неё закрыт.`,
      );
      continue;
    }
    const was = prev?.models?.[id];
    if (!was) continue;
    for (const [field, name] of [
      ["in", "вход"],
      ["out", "выход"],
    ]) {
      const before = was[field];
      const after = cur[field];
      if (!(before > 0) || !Number.isFinite(after)) continue;
      const pct = ((after - before) / before) * 100;
      if (pct >= CONFIG.priceJumpPct) {
        alarms.push(
          `💸 ${id} подорожала: ${name} ${usd(before)} → ${usd(after)} за млн (+${Math.round(pct)}%). Себестоимость разбора вырастет.`,
        );
      }
    }
  }

  // 2. Новинки с прошлой проверки.
  const fresh = Object.keys(now).filter((id) => !prev?.models?.[id]);
  for (const id of fresh) {
    const m = byId.get(id);
    if (!isRelevant(m)) continue;
    const row = {
      id,
      in: perM(m.pricing.prompt),
      out: perM(m.pricing.completion),
      ctx: m.context_length,
    };
    if (isAffordable(m)) candidates.push(row);
    else fyi.push(row);
  }

  return { now, alarms, candidates, fyi };
}

function formatMessage({ alarms, candidates, fyi, now }) {
  const parts = [];
  if (alarms.length) parts.push(alarms.join("\n"));

  // Цену боевой модели берём из свежего каталога, а не из зашитой строки: сменим
  // модель на проде — сообщение поедет за ней само (правило проекта №3).
  const prod = now[CONFIG.prodModel];
  const prodLine = prod
    ? `${CONFIG.prodModel} (${price(prod)})`
    : `${CONFIG.prodModel} (в каталоге её больше нет — см. тревогу выше)`;

  if (candidates.length) {
    const lines = candidates.map((c) => `• ${c.id} — ${price(c)}, контекст ${ctx(c.ctx)}`);
    parts.push(
      `🆕 Вышло новое, и нам по карману:\n${lines.join("\n")}\n\n` +
        `Сейчас на проде: ${prodLine}.\n` +
        `Делать ничего не надо — обсудим за компом.`,
    );
  }

  if (fyi.length) {
    const shown = [...fyi].sort((a, b) => a.in - b.in).slice(0, FYI_LIMIT);
    const tail = fyi.length - shown.length;
    parts.push(
      `📋 Тоже вышли, но дорогие для нас:\n` +
        shown.map((c) => `• ${c.id} — ${price(c)}`).join("\n") +
        (tail > 0 ? `\n• …и ещё ${tail} — все дороже перечисленных` : ""),
    );
  }

  return parts.join("\n\n");
}

// ───────────────────────────── отправка ─────────────────────────────

async function tg(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("нет TELEGRAM_BOT_TOKEN (EnvironmentFile в юните?)");
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`Telegram ответил ${r.status}`);
}

// ───────────────────────────── ход ─────────────────────────────

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  } catch {
    return null; // первая проверка
  }
}

// Сторож, который тихо умер, хуже отсутствующего: Артём считает, что за моделями следят,
// а проверок нет неделями. Разовый провал (OpenRouter моргнул, релей чихнул) глотаем молча —
// до следующей проверки 3 дня, спешить некуда. Но два подряд — это уже ~6 дней вслепую,
// и про это надо сказать один раз, без спама на каждой попытке.
const FAILS_PATH = `${STATE_PATH}.fails`;
const FAILS_BEFORE_ALARM = 2;

function readFails() {
  try {
    return Number(readFileSync(FAILS_PATH, "utf8").trim()) || 0;
  } catch {
    return 0; // счётчика ещё нет — значит провалов подряд не было
  }
}

async function onFailure(err) {
  const fails = readFails() + 1;
  writeFileSync(FAILS_PATH, String(fails));
  if (fails === FAILS_BEFORE_ALARM) {
    await tg(
      `🔕 Слежка за моделями падает ${fails} раза подряд (~${fails * 3} дней вслепую): ${err.message}\n` +
        `Проверить: journalctl -u model-watch -n 30 на релее.`,
    ).catch(() => {}); // Telegram тоже лежит — в логи systemd уже записано, больше сделать нечего
  }
  console.error(`[model-watch] провал №${fails}: ${err.stack || err.message}`);
  process.exit(1);
}

let catalog;
try {
  catalog = await fetchCatalog();
} catch (err) {
  if (DRY) throw err;
  await onFailure(err);
}

const prev = loadState();
const { now, alarms, candidates, fyi } = buildReport(catalog, prev);

// Первый запуск: снимка нет, «новыми» выглядят все 300+ моделей. Молча запоминаем
// каталог и говорим об этом одной строкой — со следующей проверки пойдёт разница.
const message = prev
  ? formatMessage({ alarms, candidates, fyi, now })
  : `👀 Слежка за моделями запущена. Запомнил каталог OpenRouter — всего моделей ${Object.keys(now).length}.\n` +
    `Боевая: ${CONFIG.prodModel}. Слежу ещё за: ${CONFIG.alsoWatched.join(", ")}.\n` +
    `Проверка раз в 3 дня, пишу только когда есть новости.`;

if (DRY) {
  console.log(message || "(тишина — ничего не изменилось)");
  console.log(
    `\n[dry-run] моделей в каталоге: ${Object.keys(now).length}; ` +
      `новых с прошлой проверки: ${prev ? Object.keys(now).filter((id) => !prev.models[id]).length : "снимка нет"}; ` +
      `снимок НЕ тронут (${STATE_PATH})`,
  );
} else {
  if (message) await tg(message);
  writeFileSync(
    STATE_PATH,
    JSON.stringify({ checkedAt: new Date().toISOString(), models: now }, null, 0),
  );
  rmSync(FAILS_PATH, { force: true }); // проверка удалась — серия провалов прервана
}
