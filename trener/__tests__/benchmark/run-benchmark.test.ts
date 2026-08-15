// Эталонный прогон тренера по 60 синтетическим раздачам (план 2026-08-08).
//
// Отличие от `__tests__/manual/run-regression.test.ts`: тот читает ПРИВАТНЫЕ раздачи из `Test/` и
// печатает тексты для чтения глазами. Этот читает эталонные фикстуры, которые лежат В GIT
// (`__tests__/fixtures/regression-benchmark/`), и главное — СЧИТАЕТ ЧИСЛА, которые можно сравнить
// между прогонами. Без такой сверки правки промптов делаются вслепую: меняем текст, смотрим одну
// раздачу на скриншоте, катим — отсюда и цикл «починили одно, вылезло другое».
//
// Запуск (ключ OpenRouter — в openrouter-key.txt в корне репо, вне git):
//   RUN_BENCHMARK=1 npx vitest run __tests__/benchmark/run-benchmark.test.ts
//   BENCH_ROOM=ipoker  — вторые 30 раздач (по умолчанию gg)
//   BENCH_PICK=1,5,12  — только эти номера
//   BENCH_BASELINE=<путь к прошлому отчёту> — в отчёт добавится дельта по каждой метрике
//   AUDIT_MODEL, AUDIT_REASONING, AUDIT_PLAYER — как в run-regression
//
// Отчёт → Test/audit/эталон-<модель>-<reasoning>.md (вне git). В конце — машиночитаемая строка
// <!--METRICS {...}--> , её и читает BENCH_BASELINE следующего прогона.
import fs from "fs";
import path from "path";
import { it, expect } from "vitest";
import { parseHandHistory } from "@/parser";
import { renderHandFacts, heroSawStreet } from "@/parser/facts";
import {
  buildHandAnalysisSystemPrompt,
  buildHandAnalysisPrompt,
  renderTableSnapshot,
  handSawPostflop,
  spotScope,
} from "@/config/prompts/hand-analysis";
import { buildDialogueQuestionSystemPrompt, buildDialogueQuestionPrompt } from "@/config/prompts/dialogue-question";
import { buildVerdictSystemPrompt, buildVerdictPrompt } from "@/config/prompts/verdict";
import {
  allowedCardSet,
  heroSuitFixMap,
  extractJson,
  validateHandAnalysis,
  validateNextQuestion,
  validateVerdict,
  noShowdownInHand,
} from "@/infrastructure/adapters/llm/parse";
import { heroFirstPostflop } from "@/parser/action-order";
import { disputesFoldWithoutPrice } from "@/parser/retelling-guard";
import type { HandAnalysisRequest, NextQuestionRequest, VerdictRequest, DialogueRoundSummary } from "@/infrastructure/adapters/llm/types";
import type { TableSnapshot } from "@/parser/types";

const RUN = process.env.RUN_BENCHMARK === "1";
const ROOM = process.env.BENCH_ROOM === "ipoker" ? "ipoker" : "gg";
const PICK = process.env.BENCH_PICK ? new Set(process.env.BENCH_PICK.split(",").map((s) => Number(s.trim()))) : null;
const MAX_ROUNDS = 3;
const CONCURRENCY = 6;
const ROOT = path.resolve(__dirname, "../../..");
const FIXTURES = path.join(__dirname, "..", "fixtures", "regression-benchmark", ROOM);
const KEY_FILE = path.join(ROOT, "openrouter-key.txt");

const MODEL = process.env.AUDIT_MODEL ?? "google/gemini-3.1-flash-lite";
const PLAYER_MODEL = "deepseek/deepseek-v3.2";
const REASONING: Record<string, unknown> = process.env.AUDIT_REASONING === "off" ? { enabled: false } : { effort: "low" };
const REASONING_TAG = process.env.AUDIT_REASONING === "off" ? "off" : "low";
const PLAYER_TAG = process.env.AUDIT_PLAYER === "novice" ? "-новичок" : "";
const OUT_FILE = path.join(ROOT, "Test", "audit", `эталон-${ROOM}-${MODEL.replace(/[/.]/g, "-")}-${REASONING_TAG}${PLAYER_TAG}.md`);

// Лимит вердикта из промпта verdict.ts: «4-6 предложений, не длиннее ~900 знаков».
const VERDICT_LIMIT = 900;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function readKey(): string {
  const m = fs.readFileSync(KEY_FILE, "utf-8").match(/sk-or-[A-Za-z0-9-_]+/);
  if (!m) throw new Error("ключ не найден: положи openrouter-key.txt в корень репо");
  return m[0];
}

let totalCost = 0;
const PRICES: Record<string, { inUsd: number; outUsd: number }> = {
  "deepseek/deepseek-v3.2": { inUsd: 0.214, outUsd: 0.322 },
};
async function llm(key: string, modelId: string, system: string, user: string, temperature?: number): Promise<string> {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 12000,
          reasoning: REASONING,
          ...(temperature !== undefined ? { temperature } : {}),
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const u = json.usage ?? {};
      const price = PRICES[modelId] ?? { inUsd: 0.5, outUsd: 1.5 };
      totalCost += ((u.prompt_tokens ?? 0) * price.inUsd + (u.completion_tokens ?? 0) * price.outUsd) / 1_000_000;
      return json.choices?.[0]?.message?.content ?? "";
    } catch (e) {
      if (i === 2) throw e;
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error("unreachable");
}

// Валидация роли = сторожа проекта. Каждый провал — ПОПЫТКА СОВРАТЬ, которую поймал код: в проде
// она стоит игроку ретрая, а нам показывает, насколько промпт держит модель. Копим тексты ошибок,
// а не глотаем их: три провала подряд роняют раздачу, но и один заслуживает попадания в сводку.
async function llmJson<T>(
  key: string,
  system: string,
  user: string,
  validate: (raw: unknown) => T,
  brakes: string[],
  temperature = 0.3,
): Promise<T> {
  let lastErr: unknown;
  let raw = "";
  for (let i = 0; i < 3; i++) {
    try {
      raw = await llm(key, MODEL, system, user, temperature);
      return validate(JSON.parse(extractJson(raw)));
    } catch (e) {
      lastErr = e;
      // Вместе с причиной брака кладём КУСОК текста, который его вызвал: без этого нельзя отличить
      // пойманное враньё от ложного срабатывания сторожа, а ложный брак в проде — это карантин
      // у живого игрока. Проверка 08.08: сторож размера ставки дал 9 браков на 30 раздач.
      brakes.push(`${(e as Error).message} :: ${raw.slice(0, 500).replace(/\s+/g, " ")}`);
    }
  }
  throw lastErr;
}

const PLAYER_NOVICE = `Ты имитируешь СОВСЕМ НОВИЧКА в покере, который отвечает тренеру в чате. Ты честно почти ничего не знаешь: не понимаешь, что такое диапазон, эквити, пот-оддсы. Отвечай коротко (1-2 предложения), разговорно, по-русски, без оформления и кавычек, и ЧЕСТНО показывай непонимание. Если тренер ОБЪЯСНИЛ и дал выбор из вариантов — выбери один и коротко скажи почему. Ничего кроме ответа игрока.`;
const PLAYER_REGULAR = `Ты имитируешь ИГРОКА-любителя микролимитных MTT, отвечающего тренеру в чате. Ответь как живой игрок: коротко (1-3 предложения), разговорно, по-русски, без оформления и кавычек; чаще с позицией и коротким аргументом, изредка «не знаю, объясни»; если просят диапазон соперника — перечисли руки нотацией (22+, A9s+, KTs+, ATo+). Ничего кроме ответа игрока.`;
const PLAYER_SYSTEM = process.env.AUDIT_PLAYER === "novice" ? PLAYER_NOVICE : PLAYER_REGULAR;

// ── Детерминированные метрики соблюдения промпта ────────────────────────────────────────────
// Их считает КОД, а не вторая LLM: цифра должна быть воспроизводимой, иначе сравнивать прогоны
// бессмысленно. Каждая метрика привязана к конкретному требованию промпта.

// Промпт запрещает markdown в тексте игроку — звёздочки и решётки он увидит буквально.
const MARKDOWN_RE = /\*\*|^#{1,3}\s|^\s*\d\.\s/m;
// Ритуальный зачин «Ты прав» — вырезается кодом (stripSycophanticOpener), но если модель его всё
// равно ставит, это видно по частоте и говорит, что правило в промпте не работает.
const SYCOPHANT_RE = /^\s*(?:да[,!\s-]+)?ты\s+прав(?![а-яё])/i;
const STREET_WORD: Record<string, RegExp> = {
  TURN: /(?:^|[^а-яё])(тёрн|терн)[а-яё]*/i,
  RIVER: /(?:^|[^а-яё])ривер[а-яё]*/i,
};

// Вопрос про улицу, до которой Hero не дожил: «что бы ты делал на тёрне, если бы заколлировал»
// после его фолда на флопе. Промпт это запрещает (dialogue-question.ts, «без гипотетики про
// несыгранные улицы»), а модель срывается — баг пойман на реальной раздаче 07.08.
//
// ⚠️Требуем ГИПОТЕТИЧЕСКУЮ рамку рядом, а не просто упоминание улицы. Первая версия метрики
// (08.08) ловила любое слово «тёрн» и забраковала совершенно законный вопрос: «Ты сбросил на
// овербет, не дожидаясь тёрна. Что именно на этом ФЛОПЕ заставило тебя поверить…» — вопрос про
// реальную точку решения, улица там лишь контекст. Метрика, которая кричит волками, хуже
// отсутствующей: по ней я чуть не откатил здоровую правку.
const HYPOTHETICAL_FRAME = /(?:если\s+бы|что\s+бы\s+ты|как\s+бы\s+ты|планирова|собирался|намеревал|стал\s+бы|дошло\s+бы|был\s+бы\s+план)/i;
function asksUnplayedStreet(question: string, snapshot: TableSnapshot): boolean {
  if (!HYPOTHETICAL_FRAME.test(question)) return false;
  return (["TURN", "RIVER"] as const).some((st) => !heroSawStreet(snapshot, st) && STREET_WORD[st].test(question));
}

// Два ЗАДАНИЯ в одном вопросе: промпт требует одно. Считаем не вопросительные знаки, а задания —
// разница принципиальна. Второе предложение-вопрос со словом «или» это ВАРИАНТЫ ОТВЕТА к тому же
// заданию («ты видел там блеф, добор с Kx или только натсы?»), а промпт такую опору прямо
// поощряет — особенно новичку. Настоящее второе задание идёт без «или»: «…и что ты думал о его
// диапазоне?» (замысел + рид). Прогон 09.08: из двух срабатываний одно было ложным именно так.
function hasTwoTasks(question: string): boolean {
  const asks = question.split(/(?<=\?)\s+/).filter((part) => part.includes("?"));
  if (asks.length < 2) return false;
  return asks.slice(1).some((part) => !/\sили\s/i.test(part));
}

type Row = {
  name: string;
  ok: boolean;
  rounds: number;
  verdictLen: number;
  brakes: string[];
  flags: string[];
};

function classifyBrake(msg: string): string {
  if (msg.includes("переврал пересказ")) return "выдуманный фолд";
  if (msg.includes("выдумал размер ставки")) return "выдуманный размер";
  if (msg.includes("выдумал вскрытие")) return "выдуманное вскрытие";
  if (msg.includes("карманную пару")) return "выдуманная пара";
  if (msg.includes("карту вне снимка")) return "выдуманная карта";
  if (msg.includes("спорит с фолдом")) return "спор с фолдом без цены";
  if (msg.includes("порядок хода")) return "перевранный порядок";
  if (msg.includes("латиницу")) return "латиница";
  if (msg.includes("CJK")) return "иероглифы";
  return "прочее/формат";
}

(RUN ? it : it.skip)(
  "эталонный прогон 30 раздач через боевую цепочку",
  async () => {
    const key = readKey();
    const files = fs.readdirSync(FIXTURES).filter((f) => /\.(txt|xml)$/i.test(f)).sort();
    const rows: Row[] = files.map((f) => ({ name: f, ok: false, rounds: 0, verdictLen: 0, brakes: [], flags: [] }));
    const perHand: string[][] = files.map(() => []);

    async function handle(i: number): Promise<void> {
      const file = files[i];
      const out = perHand[i];
      const row = rows[i];
      out.push(`\n---\n\n## #${i + 1} ${file}`);

      const parsed = parseHandHistory(fs.readFileSync(path.join(FIXTURES, file)));
      if (!parsed.ok || parsed.data.hands.length === 0) {
        out.push(`❌ файл не распознан парсером`);
        row.flags.push("не распознан");
        return;
      }
      const data = parsed.data;
      const h = data.hands[0];
      const snapshot = h.tableSnapshot;
      const tournament = {
        handsCount: data.handsCount,
        vpipPercent: data.vpipPercent,
        resultBuyins: data.resultBuyins,
        styleDiagnosis: data.styleDiagnosis,
      };
      out.push(`**Важность:** ${h.importanceLevel} · **результат:** ${h.chipResult} фишек`);
      out.push(`\n<details><summary>факты парсера</summary>\n\n${renderHandFacts(snapshot)}\n</details>`);

      try {
        const req: HandAnalysisRequest = {
          locale: "ru",
          importanceLevel: h.importanceLevel,
          chipResult: h.chipResult,
          tableSnapshot: snapshot,
          tournament,
        };
        const analysis = await llmJson(
          key,
          buildHandAnalysisSystemPrompt("ru", { ...spotScope(snapshot), socratic: h.importanceLevel === "CRITICAL" }),
          buildHandAnalysisPrompt(req),
          (raw) => validateHandAnalysis(raw as Parameters<typeof validateHandAnalysis>[0], req),
          row.brakes,
        );
        out.push(`\n**played:** ${analysis.played}`);
        out.push(`**optimal:** ${analysis.optimal}`);
        if (MARKDOWN_RE.test(analysis.played)) row.flags.push("markdown в played");

        if ("note" in analysis && analysis.note) {
          out.push(`**note:** ${analysis.note}`);
          row.ok = true;
          return;
        }
        if (!("question" in analysis) || !analysis.question) {
          row.ok = true;
          return;
        }

        const snapshotText = renderTableSnapshot(snapshot, "ru");
        const history: DialogueRoundSummary[] = [];
        let question = analysis.question;
        const draftVerdict = analysis.draftVerdict ?? "";
        out.push(`\n**Вопрос 1${analysis.answerMode === "range" ? " [сетка]" : ""}:** ${question}`);
        if (asksUnplayedStreet(question, snapshot)) row.flags.push("вопрос про несыгранную улицу");
        if (hasTwoTasks(question)) row.flags.push("два задания в вопросе");

        for (let round = 1; round <= MAX_ROUNDS; round++) {
          const raw = await llm(key, PLAYER_MODEL, PLAYER_SYSTEM, `Раздача:\n${snapshotText}\n\nВопрос тренера: «${question}»\n\nТвой ответ игрока:`);
          const answer = raw.trim().replace(/^["«]|["»]$/g, "");
          out.push(`**Игрок:** ${answer}`);
          history.push({ roundNumber: round, question, answer });
          row.rounds = round;
          const nq: NextQuestionRequest = { locale: "ru", history, draftVerdict, chipResult: h.chipResult, tableSnapshot: snapshot, tournament };
          const next = await llmJson(
            key,
            buildDialogueQuestionSystemPrompt("ru", { ...spotScope(snapshot) }),
            buildDialogueQuestionPrompt(nq),
            (r) => validateNextQuestion(r as Parameters<typeof validateNextQuestion>[0], "ru", allowedCardSet(snapshot), heroSuitFixMap(snapshot), heroFirstPostflop(snapshot)),
            row.brakes,
          );
          if (next.complete || !next.question) break;
          question = next.question;
          out.push(`**Вопрос ${round + 1}${next.answerMode === "range" ? " [сетка]" : ""}:** ${question}`);
          if (asksUnplayedStreet(question, snapshot)) row.flags.push("вопрос про несыгранную улицу");
          if (hasTwoTasks(question)) row.flags.push("два задания в вопросе");
        }

        const vq: VerdictRequest = { locale: "ru", history, draftVerdict, chipResult: h.chipResult, tableSnapshot: snapshot, tournament };
        const verdict = await llmJson(
          key,
          buildVerdictSystemPrompt("ru", { ...spotScope(snapshot) }),
          buildVerdictPrompt(vq),
          (r) => validateVerdict(r as Parameters<typeof validateVerdict>[0], "ru", allowedCardSet(snapshot), heroSuitFixMap(snapshot), heroFirstPostflop(snapshot), noShowdownInHand(snapshot), snapshot),
          row.brakes,
        );
        out.push(`\n**ВЕРДИКТ:** ${verdict.verdict}`);
        row.verdictLen = verdict.verdict.length;
        // Спорит с фолдом, не назвав цену колла. Метрика устойчивая: условие считает парсер,
        // а не сэмплирование модели (регресс 09.08 — тренер звал платить 25 BB в банк 6 BB).
        if (disputesFoldWithoutPrice(verdict.verdict, snapshot) !== null) row.flags.push("спорит с фолдом без цены");
        row.ok = true;
        if (verdict.verdict.length > VERDICT_LIMIT) row.flags.push("вердикт длиннее лимита");
        if (MARKDOWN_RE.test(verdict.verdict)) row.flags.push("markdown в вердикте");
        if (SYCOPHANT_RE.test(verdict.verdict)) row.flags.push("ритуальное «Ты прав»");
        process.stdout.write(`\n→ #${i + 1} ok (${row.rounds} р., вердикт ${row.verdictLen} зн.)`);
      } catch (e) {
        out.push(`\n❌ упало после 3 попыток: ${(e as Error).message}`);
        row.flags.push("не сдал ответ за 3 попытки");
        process.stdout.write(`\n→ #${i + 1} ОШИБКА`);
      } finally {
        // Браки — в отчёт по раздаче, а не только в счётчик: их надо читать глазами и решать,
        // сторож поймал враньё или сам оказался неправ.
        if (row.brakes.length) out.push(`\n**Браки сторожей (${row.brakes.length}):**\n` + row.brakes.map((b) => `- ${b}`).join("\n"));
      }
    }

    // ── сводка ────────────────────────────────────────────────────────────────────────────
    function metrics() {
      const done = rows.filter((r) => r.ok);
      const withVerdict = rows.filter((r) => r.verdictLen > 0);
      const count = (flag: string) => rows.filter((r) => r.flags.includes(flag)).length;
      const brakeCounts: Record<string, number> = {};
      for (const r of rows) for (const b of r.brakes) {
        const k = classifyBrake(b);
        brakeCounts[k] = (brakeCounts[k] ?? 0) + 1;
      }
      return {
        раздач: rows.length,
        дошло_до_конца: done.length,
        упало: count("не сдал ответ за 3 попытки"),
        средняя_длина_вердикта: withVerdict.length
          ? Math.round(withVerdict.reduce((s, r) => s + r.verdictLen, 0) / withVerdict.length)
          : 0,
        вердиктов_длиннее_лимита: count("вердикт длиннее лимита"),
        среднее_раундов: done.length ? Math.round((done.reduce((s, r) => s + r.rounds, 0) / done.length) * 10) / 10 : 0,
        вопрос_про_несыгранную_улицу: count("вопрос про несыгранную улицу"),
        два_задания_в_вопросе: count("два задания в вопросе"),
        спор_с_фолдом_без_цены: count("спорит с фолдом без цены"),
        markdown: count("markdown в вердикте") + count("markdown в played"),
        ритуальное_ты_прав: count("ритуальное «Ты прав»"),
        браков_сторожей_всего: rows.reduce((s, r) => s + r.brakes.length, 0),
        ...Object.fromEntries(Object.entries(brakeCounts).map(([k, v]) => [`брак_${k.replace(/ /g, "_")}`, v])),
      } as Record<string, number>;
    }

    function summaryBlock(): string[] {
      const m = metrics();
      const base = process.env.BENCH_BASELINE ? readBaseline(process.env.BENCH_BASELINE) : null;
      const lines = ["", "---", "", "# Сводка", "", "| метрика | значение | было | дельта |", "|---|---|---|---|"];
      for (const [k, v] of Object.entries(m)) {
        const b = base?.[k];
        // Округление обязательно: у дробных метрик (среднее раундов) голая разность печаталась
        // как «+0.09999999999999998» — плавающая точка в отчёте выглядит как баг измерителя.
        const raw = b === undefined ? 0 : Math.round((v - b) * 100) / 100;
        const delta = b === undefined ? "" : raw === 0 ? "=" : `${raw > 0 ? "+" : ""}${raw}`;
        lines.push(`| ${k.replace(/_/g, " ")} | ${v} | ${b ?? ""} | ${delta} |`);
      }
      lines.push(
        "",
        "⚠️**Что тут сигнал, а что шум.** Замер 08.08 на ОДНИХ И ТЕХ ЖЕ промптах дал 3 → 11 → 8 браков",
        "сторожей подряд: счёт браков и «упало» гуляют от прогона к прогону, по ним одиночную правку",
        "судить НЕЛЬЗЯ (нужны 2-3 повтора). Устойчивы и годятся для сравнения: раундов диалога, вопрос",
        "про несыгранную улицу, два задания в вопросе, markdown, ритуальное «Ты прав», длина вердикта.",
      );
      lines.push("", `Стоимость прогона: ~$${totalCost.toFixed(4)}`);
      lines.push("", `<!--METRICS ${JSON.stringify(m)}-->`);
      return lines;
    }

    function readBaseline(file: string): Record<string, number> | null {
      try {
        const m = fs.readFileSync(file, "utf-8").match(/<!--METRICS (\{.*?\})-->/);
        return m ? (JSON.parse(m[1]) as Record<string, number>) : null;
      } catch {
        return null;
      }
    }

    const header = () => [
      `# Эталонный прогон — ${ROOM.toUpperCase()}, ${files.length} раздач — ${MODEL} (reasoning ${REASONING_TAG}${PLAYER_TAG}) — ${new Date().toISOString().slice(0, 16)}`,
      ``,
      `Фикстуры: \`__tests__/fixtures/regression-benchmark/${ROOM}/\`. Метрики внизу считает код, не модель.`,
    ];
    const flush = () => fs.writeFileSync(OUT_FILE, [...header(), ...perHand.flat(), ...summaryBlock()].join("\n"), "utf-8");

    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    let cursor = 0;
    const worker = async () => {
      while (cursor < files.length) {
        const idx = cursor++;
        if (PICK && !PICK.has(idx + 1)) continue;
        await handle(idx);
      }
    };
    const flusher = setInterval(flush, 30_000);
    try {
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    } finally {
      clearInterval(flusher);
      flush();
    }
    process.stdout.write(`\n\nЗаписано: ${OUT_FILE} (~$${totalCost.toFixed(4)})\n`);
    expect(fs.existsSync(OUT_FILE)).toBe(true);
  },
  2_700_000,
);
