// Отбор ~50 разнообразных раздач из Test/ для регресс-прогона тренера (RUN_SELECT=1). Без LLM:
// сканирует Test/, парсит, метит раздачи ТЕГАМИ (уровень важности, рум, улица, категория готовой
// руки, тип спота, новые факты) и жадно набирает набор, максимизируя покрытие ВСЕХ тегов — чтобы
// регресс бил по всей сложности пайплайна, а не по одному типу. Список → scratchpad/select-50.json.
// Сами HH-файлы приватны (Test/ вне git); коммитим только этот отбор-харнесс.
import fs from "fs";
import path from "path";
import { it, expect } from "vitest";
import { parseHandHistory } from "@/parser";
import { renderHandFacts } from "@/parser/facts";
import { heroMadeHand } from "@/parser/made-hand";
import { handCode } from "@/config/poker/hand-codes";

const RUN = process.env.RUN_SELECT === "1";
const ROOT = path.resolve(__dirname, "../../..");
// Список отбора кладём в Test/audit (Test/ вне git) — его читает прогон-харнесс run-regression.
const OUT = path.join(ROOT, "Test", "audit", "select-regression.json");
const TARGET = Number(process.env.SELECT_N ?? 50);

// Маркеры фактов (ЛЮБЫХ, не только новых) — покрытие всего, что умеет пайплайн.
const FACT_MARKERS: { name: string; re: RegExp }[] = [
  { name: "чарт-вердикт", re: /Вердикт префлоп-чарта/ },
  { name: "дро", re: /Дро Hero на/ },
  { name: "ауты-улучшение", re: /Ауты Hero на улучшение/ },
  { name: "опасность-борда", re: /Опасность борда/ },
  { name: "вскрытые-карты", re: /Вскрытые карты/ },
  { name: "пот-оддс-решение", re: /Решение Hero на .* прибыльно при эквити/ },
  { name: "имплайд-оддсы", re: /обратные оддсы|добрать|по эквити это фолд/ },
  { name: "ставка-hero", re: /Ставка Hero \(/ },
  { name: "эквити-против-чарта", re: /Эквити .* против (пуш|опен|коллирующего)/ },
  { name: "ре-пуш-геометрия", re: /ре-пуш|возврат излишка|покрываешь/ },
  { name: "M-фактор-короткий", re: /M-фактор Hero: [0-9](\.|,| )/ },
  // новые факты этой сессии
  { name: "нов:сет-топ/нетоп", re: /сет .* - (НЕ )?[Тт]оп|ТОП-сет/ },
  { name: "нов:трипс", re: /Твой трипс/ },
  { name: "нов:две-пары-общая", re: /старшая пара .* - на борде, общая/ },
  { name: "нов:кикер-доминация", re: /Кикер к паре .* доминируется/ },
  { name: "нов:комбо-перепись", re: /Расклады против твоей руки/ },
  { name: "нов:блеф-кэтчер", re: /блеф-кэтчер/ },
  { name: "нов:замазан", re: /Ты уже вложил .* стека|Колл ставит тебя в олл-ин/ },
  { name: "нов:префлоп-геометрия", re: /Твой префлоп-(опен|изоляция|3-бет|4-бет)/ },
  { name: "нов:ярлык-карты", re: /Карта (тёрна|ривера) для тебя/ },
  { name: "нов:блокер-натс-флеша", re: /натсовый флеш у соперника заблокирован/ },
  { name: "нов:риверный-SPR", re: /на входе в следующую улицу/ },
  { name: "нов:натсовость", re: /НАТСОВЫЙ|- НЕ натс/ },
  { name: "нов:сквиз-риск", re: /могли войти или сквизнуть/ },
];

function roomOf(file: string): string {
  const f = file.toLowerCase();
  if (/gg\d|bounty hunters|руки\//.test(f)) return "gg";
  for (const r of ["888", "chico", "ipoker", "winamax", "wpn", "pokerstars", "ps-", "pokerplanets", "ignition"]) {
    if (f.includes(r)) return r.replace("ps-", "pokerstars");
  }
  return "other";
}

function scanDir(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...scanDir(p));
    else if ((e.name.endsWith(".txt") || e.name.endsWith(".xml")) && !e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

type Cand = { file: string; idx: number; code: string; board: string; tags: string[] };

(RUN ? it : it.skip)(
  "отбор разнообразных раздач по всем фактам",
  () => {
    const dirs = [path.join(ROOT, "Test", "руки"), path.join(ROOT, "Test", "audit"), path.join(ROOT, "Test", "samples")];
    const files = dirs.flatMap(scanDir).filter((f) => !/merged|аудит-турнир|glm-off-all/i.test(f));
    const cands: Cand[] = [];

    for (const file of files) {
      let parsed;
      try {
        parsed = parseHandHistory(fs.readFileSync(file));
      } catch {
        continue;
      }
      if (!parsed.ok) continue;
      const room = roomOf(path.relative(ROOT, file));
      for (let i = 0; i < parsed.data.hands.length; i++) {
        const h = parsed.data.hands[i];
        const snap = h.tableSnapshot;
        let facts = "";
        try {
          facts = renderHandFacts(snap) ?? "";
        } catch {
          continue;
        }
        const made = heroMadeHand(snap.heroCards, snap.board);
        const street = ["префлоп", "флоп", "флоп", "флоп", "тёрн", "ривер"][snap.board.length] ?? "ривер";
        const tags = [
          `level:${h.importanceLevel}`,
          `room:${room}`,
          `street:${street}`,
          `hand:${made?.category ?? "префлоп"}`,
          ...FACT_MARKERS.filter((m) => m.re.test(facts)).map((m) => `fact:${m.name}`),
        ];
        cands.push({
          file: path.relative(ROOT, file),
          idx: i,
          code: handCode(snap.heroCards) ?? "?",
          board: snap.board.join(" ") || "префлоп",
          tags,
        });
      }
    }

    // Жадный отбор с максимизацией маржинального покрытия РЕДКИХ тегов.
    const freq: Record<string, number> = {};
    for (const c of cands) for (const t of c.tags) freq[t] = (freq[t] ?? 0) + 1;
    const cover: Record<string, number> = {};
    const picked: Cand[] = [];
    const pool = [...cands];
    while (picked.length < TARGET && pool.length) {
      // балл кандидата = сумма по его тегам: 1/(1+уже покрыто) * 1/log(частота) — редкие и непокрытые весомее
      let best = -1,
        bestScore = -Infinity;
      for (let k = 0; k < pool.length; k++) {
        const c = pool[k];
        const score = c.tags.reduce(
          (s, t) => s + (1 / (1 + (cover[t] ?? 0))) * (1 / Math.log2((freq[t] ?? 1) + 1.5)),
          0,
        );
        if (score > bestScore) {
          bestScore = score;
          best = k;
        }
      }
      const c = pool.splice(best, 1)[0];
      picked.push(c);
      for (const t of c.tags) cover[t] = (cover[t] ?? 0) + 1;
    }

    const summary = {
      totalCandidates: cands.length,
      tagFreqAll: Object.fromEntries(Object.entries(freq).sort((a, b) => b[1] - a[1])),
      picked: picked.length,
      coverage: Object.fromEntries(Object.entries(cover).sort((a, b) => b[1] - a[1])),
      hands: picked.map((c) => ({ file: c.file, idx: c.idx, code: c.code, board: c.board, tags: c.tags })),
    };
    fs.writeFileSync(OUT, JSON.stringify(summary, null, 2), "utf-8");
    console.log(`ОТОБРАНО ${picked.length} из ${cands.length}; тегов покрыто ${Object.keys(cover).length}/${Object.keys(freq).length}`);
    expect(picked.length).toBeGreaterThan(0);
  },
  120_000,
);
