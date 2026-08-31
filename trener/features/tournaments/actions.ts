import { createHash, randomUUID } from "crypto";
import { prisma } from "@/infrastructure/db/client";
import { enqueue, kickWorker } from "@/infrastructure/queue";
import { parseHandHistory, diagnoseParse, type ParseAnomaly } from "@/parser";
import { safeNotifyAdmin } from "@/infrastructure/adapters/notify";
import { safeStore } from "@/infrastructure/adapters/storage";
import { isStorageConfigured } from "@/config/storage";
import { mergeSameTournamentFiles } from "./merge-files";

// Сторож разбора: если присланный файл не распознан / разобран подозрительно —
// сигналим админу в Telegram (бот-сторож), чтобы прицельно подстроить парсер под
// новый рум, а не ждать жалобы. Шлём только метку рума и строку-сигнатуру заголовка
// (без HH-файла и ников). Антиспам: одна и та же сигнатура — не чаще раза в 10 минут
// (пачка файлов одного незнакомого формата не зальёт чат).
const ALERT_THROTTLE_MS = 10 * 60 * 1000;
const lastAlertAt = new Map<string, number>();

// Email игрока — прямо в тексте алерта, чтобы Артём мог сразу лично написать
// (mailto), не заходя в базу. Запрос идёт только после троттлинга по сигнатуре —
// не дёргаем БД на каждый файл одной и той же незнакомой пачки.
async function alertAdmin(anomaly: ParseAnomaly, playerId: string): Promise<void> {
  const now = Date.now();
  if (now - (lastAlertAt.get(anomaly.signature) ?? 0) < ALERT_THROTTLE_MS) return;
  lastAlertAt.set(anomaly.signature, now);
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { email: true } });
  const playerLine = player?.email ? `\nИгрок: ${player.email} (mailto:${player.email})` : "";
  void safeNotifyAdmin(
    `⚠️ Разбор HH требует внимания\nПричина: ${anomaly.reason}\nСигнатура: ${anomaly.signature}${playerLine}`,
  );
}

// Очищаем имя файла пользователя перед записью в БД: только базовое имя (без пути —
// защита от «../»), без управляющих символов, ограниченной длины.
function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  let out = "";
  for (const ch of base) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? "_" : ch;
  }
  return out.slice(0, 200) || "file";
}

// Откладываем образец нераспознанного файла, чтобы потом написать парсер нового рума.
// Текст кладём в приватное S3 (ключ генерим САМИ — не из имени пользователя), бинарь/
// нечитаемое НЕ кладём (storable=false), но факт фиксируем записью. Всё мягко: сбой
// хранилища/записи не роняет загрузку. Без настроенного S3 (дев/тесты) — ничего не делаем.
async function archiveUnrecognized(
  fileBuffer: Buffer,
  originalFilename: string,
  playerId: string,
  anomaly: ParseAnomaly,
): Promise<void> {
  if (!isStorageConfigured()) return;
  try {
    const sha256 = createHash("sha256").update(fileBuffer).digest("hex");
    let storageKey: string | null = null;
    if (anomaly.storable) {
      const day = new Date().toISOString().slice(0, 10);
      const key = `unrecognized/${day}/${randomUUID()}.txt`;
      if (await safeStore(key, fileBuffer, "text/plain; charset=utf-8")) storageKey = key;
    }
    await prisma.unrecognizedUpload.create({
      data: {
        playerId,
        signature: anomaly.signature,
        reason: anomaly.reason,
        storageKey,
        originalFilename: safeName(originalFilename),
        sizeBytes: fileBuffer.length,
        sha256,
      },
    });
  } catch (err) {
    console.error("[unrecognized] не удалось сохранить образец:", err);
  }
}

type UploadInput = {
  fileBuffer: Buffer;
  originalFilename: string;
  playerId: string;
};

export type UploadResult =
  | { ok: true; tournamentId: string }
  | { ok: false; error: "UNSUPPORTED_FORMAT" | "PARSE_FAILED" | "PAYWALL" | "LIMIT_REACHED" }
  | { ok: false; error: "DUPLICATE"; existingTournamentId: string };

export async function uploadTournament(input: UploadInput): Promise<UploadResult> {
  const { fileBuffer, originalFilename, playerId } = input;

  // Разбираем синхронно для валидации формата и получения метрик.
  // Метрики кладём в payload задачи — воркер применит их к турниру.
  const parsed = parseHandHistory(fileBuffer);
  const anomaly = diagnoseParse(parsed, fileBuffer);
  if (anomaly) await alertAdmin(anomaly, playerId);

  if (!parsed.ok) {
    // Файл не распознан/не разобран — откладываем образец под будущий парсер рума.
    if (anomaly) await archiveUnrecognized(fileBuffer, originalFilename, playerId, anomaly);
    return { ok: false, error: parsed.error.type };
  }

  const { room, externalTournamentId, name, playedAt } = parsed.data;

  // Загрузка больше НЕ упирается в стену: грузить можно любой турнир (метрики парсера
  // бесплатны). Платный гейт переехал на РАЗБОР — решение «разбирать или запереть»
  // принимает шаг парсинга через assessAiAccess (см. queue/steps/parse-tournament.ts).
  // Часовой лимит загрузок (checkUploadQuota) остаётся в точке входа страницы.

  // Дедупликация: тот же игрок уже загрузил турнир с этим номером с той же площадки.
  // Тот же номер — ещё не значит тот же файл: GG пишет КАЖДЫЙ вход в турнир (re-entry)
  // отдельным файлом с одним номером. Различаем по моментам раздач: раздачи совпадают —
  // настоящий дубль (ссылка на существующий разбор); раздачи другие — это перезаход,
  // создаём отдельный турнир с номером входа (план 2026-07-05-кулеры-и-перезаходы).
  const sameKey = await prisma.tournament.findMany({
    where: { playerId, room, externalTournamentId, deletedAt: null },
    select: { id: true, entryNumber: true, playedAt: true },
  });

  let entryNumber = 1;
  if (sameKey.length > 0) {
    const newTimes = new Set(
      parsed.data.hands
        .map((h) => (h.playedAt ? new Date(h.playedAt).getTime() : null))
        .filter((t): t is number => t !== null),
    );
    const existingHands = await prisma.hand.findMany({
      where: { tournamentId: { in: sameKey.map((t) => t.id) }, playedAt: { not: null } },
      select: { playedAt: true },
    });
    const existingTimes = new Set(existingHands.map((h) => h.playedAt!.getTime()));
    let overlap = 0;
    for (const t of newTimes) if (existingTimes.has(t)) overlap += 1;

    // Раздачи существующего турнира ещё не записаны (пакетная загрузка: перезаход
    // приходит следом за первым файлом, который только встал в очередь парсинга) —
    // сравниваем по моменту ПЕРВОЙ раздачи турнира: у дубля того же файла он совпадает,
    // у перезахода отличается на десятки минут (QA 2026-07-05, пункт 1).
    const sameFirstHand = sameKey.some(
      (tt) => Math.abs(tt.playedAt.getTime() - new Date(playedAt).getTime()) < 60_000,
    );
    const isDuplicate =
      newTimes.size === 0
        ? true // без таймстемпов надёжно не различить — консервативно дубль
        : existingTimes.size === 0
          ? sameFirstHand
          : overlap / newTimes.size >= 0.5;
    if (isDuplicate) {
      return { ok: false, error: "DUPLICATE", existingTournamentId: sameKey[0].id };
    }
    entryNumber = Math.max(...sameKey.map((t) => t.entryNumber)) + 1;
  }

  const tournament = await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.create({
      data: {
        playerId,
        playedAt: new Date(playedAt), // реальная дата турнира из HH, не момент загрузки
        room,
        name,
        externalTournamentId,
        entryNumber,
        status: "UPLOADED",
      },
    });

    await enqueue(tx, {
      type: "PARSE_TOURNAMENT",
      payload: { tournamentId: t.id, parsed: parsed.data },
    });

    return t;
  });

  // Будим воркер сразу — парсинг и разбор стартуют мгновенно, а не через ≤15с крона.
  // Фоново: не держим ответ загрузки, пока разгребается очередь.
  void kickWorker(prisma);

  return { ok: true, tournamentId: tournament.id };
}

export type BatchItem = { fileBuffer: Buffer; originalFilename: string };

export type BatchSummary = {
  uploaded: number; // создано новых турниров
  duplicates: number; // уже были у игрока (повтор не создаём)
  failed: number; // не-MTT / не распарсилось
  firstTournamentId: string | null; // первый созданный/существующий — для редиректа
  // Точный результат, когда в пачке ровно один файл: одиночная загрузка сохраняет
  // прежнее поведение (страница турнира / дубль / конкретная ошибка).
  singleResult: UploadResult | null;
};

// Пакетная загрузка: прогоняет каждый файл через uploadTournament и собирает итог.
// Цикл, а не транзакция: файлы независимы — дубль или не-MTT среди них не должен
// валить остальные. kickWorker внутри uploadTournament — single-flight, повторные
// вызовы в цикле безвредны. Потолок/срез пачки и квоту проверяет точка входа
// (app/analyze/page.tsx) ДО вызова — сюда приходят уже отобранные файлы.
// Перед циклом склеиваем многостольные файлы одного турнира в один (mergeSameTournamentFiles).
export async function uploadTournamentsBatch(
  items: BatchItem[],
  playerId: string,
): Promise<BatchSummary> {
  let uploaded = 0;
  let duplicates = 0;
  let failed = 0;
  let firstTournamentId: string | null = null;
  let singleResult: UploadResult | null = null;

  const mergedItems = mergeSameTournamentFiles(items);

  for (const item of mergedItems) {
    const result = await uploadTournament({
      fileBuffer: item.fileBuffer,
      originalFilename: item.originalFilename,
      playerId,
    });
    if (mergedItems.length === 1) singleResult = result;

    if (result.ok) {
      uploaded++;
      firstTournamentId ??= result.tournamentId;
    } else if (result.error === "DUPLICATE") {
      duplicates++;
      firstTournamentId ??= result.existingTournamentId;
    } else {
      failed++;
    }
  }

  return { uploaded, duplicates, failed, firstTournamentId, singleResult };
}
