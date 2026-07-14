// Регресс-прогон отобранных раздач через боевой пайплайн тренера (RUN_REGRESSION=1). Читает список
// из Test/audit/select-regression.json (готовит select-50-харнесс), группирует по файлам, для каждой
// раздачи гоняет hand-analysis → диалог (симулятор игрока) → вердикт на прод-модели (GLM-off по
// умолчанию). Результат → Test/audit/регресс-<model>.md. Проверяем, что тренер обыгрывает ВСЕ факты
// словами, не выдумывает, не ломается. Сами HH приватны (Test/ вне git); коммитим только харнесс.
import fs from "fs";
import path from "path";
import { it, expect } from "vitest";
import { parseHandHistory } from "@/parser";
import { profileHandOpponents } from "@/parser/opponent-profile";
import { renderHandFacts } from "@/parser/facts";
import {
  buildHandAnalysisSystemPrompt,
  buildHandAnalysisPrompt,
  renderTableSnapshot,
} from "@/config/prompts/hand-analysis";
import { buildDialogueQuestionSystemPrompt, buildDialogueQuestionPrompt } from "@/config/prompts/dialogue-question";
import { buildVerdictSystemPrompt, buildVerdictPrompt } from "@/config/prompts/verdict";
import { extractJson, validateHandAnalysis, validateNextQuestion, validateVerdict } from "@/infrastructure/adapters/llm/parse";
import type { HandAnalysisRequest, NextQuestionRequest, VerdictRequest, DialogueRoundSummary } from "@/infrastructure/adapters/llm/types";
import type { OpponentFact } from "@/parser/opponent-profile";

const RUN = process.env.RUN_REGRESSION === "1";
// PICK="3,7,33" — прогнать только эти номера раздач (#N из прошлого отчёта). Пусто — все.
const PICK = process.env.PICK ? new Set(process.env.PICK.split(",").map((s) => Number(s.trim()))) : null;
const MAX_ROUNDS = 3;
const CONCURRENCY = 6;
const ROOT = path.resolve(__dirname, "../../..");
const KEY_FILE = path.join(ROOT, "openrouter-key.txt");
const LIST_FILE = path.join(ROOT, "Test", "audit", "select-regression.json");

const KNOWN_PRICES: Record<string, { inUsd: number; outUsd: number }> = {
  "deepseek/deepseek-v3.2": { inUsd: 0.214, outUsd: 0.322 },
  "z-ai/glm-5.2": { inUsd: 0.392, outUsd: 1.232 },
};
const MODEL = process.env.AUDIT_MODEL ?? "z-ai/glm-5.2";
const PLAYER_MODEL = "deepseek/deepseek-v3.2";
const REASONING: Record<string, unknown> = process.env.AUDIT_REASONING === "off" ? { enabled: false } : { effort: "low" };
// Гибрид как в проде (openrouter.ts): CRITICAL-разбор и весь диалог/вердикт → low, note-разборы → off.
const HYBRID = process.env.HYBRID === "1";
const REASONING_TAG = HYBRID ? "hybrid" : process.env.AUDIT_REASONING === "off" ? "off" : "low";
const OUT_FILE = path.join(ROOT, "Test", "audit", `регресс-${MODEL.replace(/[/.]/g, "-")}-${REASONING_TAG}.md`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function readKey(): string {
  const m = fs.readFileSync(KEY_FILE, "utf-8").match(/sk-or-[A-Za-z0-9-_]+/);
  if (!m) throw new Error("ключ не найден");
  return m[0];
}

let totalCost = 0;
// HYBRID=1 включает эмуляцию прод-гибрида; иначе используется глобальный REASONING (чистые режимы).
const LOW: Record<string, unknown> = { effort: "low" };
const OFF: Record<string, unknown> = { enabled: false };
async function llm(
  key: string,
  modelId: string,
  system: string,
  user: string,
  reasoning: Record<string, unknown> = REASONING,
  attempts = 3,
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          max_tokens: 12000,
          reasoning,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const u = json.usage ?? {};
      const price = KNOWN_PRICES[modelId] ?? { inUsd: 0.5, outUsd: 1.5 };
      totalCost += ((u.prompt_tokens ?? 0) * price.inUsd + (u.completion_tokens ?? 0) * price.outUsd) / 1_000_000;
      return json.choices?.[0]?.message?.content ?? "";
    } catch (e) {
      if (i === attempts - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error("unreachable");
}
async function llmJson<T>(
  key: string,
  modelId: string,
  system: string,
  user: string,
  validate: (raw: unknown) => T,
  reasoning: Record<string, unknown> = REASONING,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return validate(JSON.parse(extractJson(await llm(key, modelId, system, user, reasoning))));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

const PLAYER_SYSTEM = `Ты имитируешь ИГРОКА-любителя микролимитных MTT, отвечающего тренеру в чате. Ответь как живой игрок: коротко (1-3 предложения), разговорно, по-русски, без оформления и кавычек; чаще с позицией и коротким аргументом, изредка «не знаю, объясни»; если просят диапазон соперника — перечисли руки нотацией (22+, A9s+, KTs+, ATo+). Ничего кроме ответа игрока.`;
async function playerAnswer(key: string, snapshotText: string, question: string): Promise<string> {
  const raw = await llm(key, PLAYER_MODEL, PLAYER_SYSTEM, `Раздача:\n${snapshotText}\n\nВопрос тренера: «${question}»\n\nТвой ответ игрока:`);
  return raw.trim().replace(/^["«]|["»]$/g, "");
}

type Pick = { file: string; idx: number; code: string; board: string; tags: string[] };

(RUN ? it : it.skip)(
  "регресс-прогон отобранных раздач",
  async () => {
    const key = readKey();
    const list = JSON.parse(fs.readFileSync(LIST_FILE, "utf-8")).hands as Pick[];
    // Парсим каждый файл один раз (кэш), берём раздачи по индексам.
    const fileCache = new Map<string, ReturnType<typeof parseHandHistory>>();
    const parseFile = (rel: string) => {
      if (!fileCache.has(rel)) fileCache.set(rel, parseHandHistory(fs.readFileSync(path.join(ROOT, rel))));
      return fileCache.get(rel)!;
    };

    const perHand: string[][] = list.map(() => []);
    async function handle(i: number): Promise<void> {
      const pick = list[i];
      const out = perHand[i];
      const parsed = parseFile(pick.file);
      if (!parsed.ok) {
        out.push(`\n## #${i} ${pick.code} — ❌ файл не распознан: ${pick.file}`);
        return;
      }
      const data = parsed.data;
      const h = data.hands[pick.idx];
      if (!h) {
        out.push(`\n## #${i} ${pick.code} — ❌ нет раздачи idx ${pick.idx}`);
        return;
      }
      const snapshot = h.tableSnapshot;
      const tournament = {
        handsCount: data.handsCount,
        vpipPercent: data.vpipPercent,
        resultBuyins: data.resultBuyins,
        styleDiagnosis: data.styleDiagnosis,
      };
      const opponents: OpponentFact[] = profileHandOpponents(
        data.hands.slice(0, pick.idx).map((p) => ({ tableData: p.tableSnapshot })),
        snapshot,
      );

      out.push(`\n---\n\n## #${i} [${h.importanceLevel}] ${pick.code} на ${pick.board} — ${path.basename(pick.file)}`);
      out.push(`**Теги:** ${pick.tags.join(", ")}`);
      const facts = renderHandFacts(snapshot);
      if (facts) out.push(`\n<details>факты парсера:\n${facts}\n</details>`);

      try {
        const req: HandAnalysisRequest = {
          locale: "ru",
          importanceLevel: h.importanceLevel,
          chipResult: h.chipResult,
          tableSnapshot: snapshot,
          tournament,
          opponents: opponents.length ? opponents : undefined,
        };
        // Гибрид: CRITICAL-разбор → low, обычный note → off (как в проде openrouter.ts).
        const anReasoning = HYBRID ? (h.importanceLevel === "CRITICAL" ? LOW : OFF) : REASONING;
        const analysis = await llmJson(
          key,
          MODEL,
          buildHandAnalysisSystemPrompt("ru"),
          buildHandAnalysisPrompt(req),
          (raw) => validateHandAnalysis(raw as Parameters<typeof validateHandAnalysis>[0], req),
          anReasoning,
        );
        out.push(`\n**played:** ${analysis.played}`);
        out.push(`**optimal:** ${analysis.optimal}`);
        if ("note" in analysis && analysis.note) {
          out.push(`**note:** ${analysis.note}`);
          return;
        }
        if (!("question" in analysis) || !analysis.question) return;

        const snapshotText = renderTableSnapshot(snapshot, "ru");
        const history: DialogueRoundSummary[] = [];
        let question = analysis.question;
        const draftVerdict = analysis.draftVerdict ?? "";
        out.push(`\n**Вопрос 1${analysis.answerMode === "range" ? " [сетка]" : ""}:** ${question}`);
        for (let round = 1; round <= MAX_ROUNDS; round++) {
          const answer = await playerAnswer(key, snapshotText, question);
          out.push(`**Игрок:** ${answer}`);
          history.push({ roundNumber: round, question, answer });
          const nq: NextQuestionRequest = { locale: "ru", history, draftVerdict, chipResult: h.chipResult, tableSnapshot: snapshot, tournament, opponents: opponents.length ? opponents : undefined };
          const next = await llmJson(
            key,
            MODEL,
            buildDialogueQuestionSystemPrompt("ru"),
            buildDialogueQuestionPrompt(nq),
            (raw) => validateNextQuestion(raw as Parameters<typeof validateNextQuestion>[0]),
            HYBRID ? LOW : REASONING, // диалог только у CRITICAL → low
          );
          if (next.complete || !next.question) break;
          question = next.question;
          out.push(`**Вопрос ${round + 1}${next.answerMode === "range" ? " [сетка]" : ""}:** ${question}`);
        }
        const vq: VerdictRequest = { locale: "ru", history, draftVerdict, chipResult: h.chipResult, tableSnapshot: snapshot, tournament, opponents: opponents.length ? opponents : undefined };
        const verdict = await llmJson(
          key,
          MODEL,
          buildVerdictSystemPrompt("ru"),
          buildVerdictPrompt(vq),
          (raw) => validateVerdict(raw as Parameters<typeof validateVerdict>[0]),
          HYBRID ? LOW : REASONING, // вердикт завершает CRITICAL-диалог → low
        );
        out.push(`\n**ВЕРДИКТ:** ${verdict.verdict}`);
        process.stdout.write(`\n→ #${i} [${h.importanceLevel}] ok (${history.length} р.)`);
      } catch (e) {
        out.push(`\n❌ ошибка: ${(e as Error).message}`);
        process.stdout.write(`\n→ #${i} ОШИБКА`);
      }
    }

    let cursor = 0;
    const worker = async () => {
      while (cursor < list.length) {
        const idx = cursor++;
        if (PICK && !PICK.has(idx)) continue; // фильтр по номерам раздач (сравнение моделей на проблемных)
        await handle(idx);
      }
    };
    const header = () => [
      `# Регресс-прогон ${list.length} отобранных раздач — ${MODEL} (reasoning ${process.env.AUDIT_REASONING ?? "low"}) — ${new Date().toISOString().slice(0, 16)}`,
      `Боевые промпты после детерминизации Правила 1 + перепроверки на самопротиворечия.`,
    ];
    const flush = () => fs.writeFileSync(OUT_FILE, [...header(), ...perHand.flat(), `\n\n---\n# Стоимость: ~$${totalCost.toFixed(4)}`].join("\n"), "utf-8");
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
