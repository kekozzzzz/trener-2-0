import { prisma } from "@/infrastructure/db/client";
import { enqueue, kickWorker } from "@/infrastructure/queue";
import { parseHandHistory } from "@/parser";
import { mergeSameTournamentFiles } from "./merge-files";

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
  const { fileBuffer, originalFilename: _originalFilename, playerId } = input;

  // Разбираем синхронно для валидации формата и получения метрик.
  // Метрики кладём в payload задачи — воркер применит их к турниру.
  const parsed = parseHandHistory(fileBuffer);

  if (!parsed.ok) {
    return { ok: false, error: parsed.error.type };
  }

  const { room, externalTournamentId, name, playedAt } = parsed.data;

  // Загрузка больше НЕ упирается в стену: грузить можно любой турнир (метрики парсера
  // бесплатны). Платный гейт переехал на РАЗБОР — решение «разбирать или запереть»
  // принимает шаг парсинга через assessAiAccess (см. queue/steps/parse-tournament.ts).
  // Часовой лимит загрузок (checkUploadQuota) остаётся в точке входа страницы.

  // Дедупликация: тот же игрок уже загрузил турнир с этим номером с той же площадки.
  // Повтор не создаём — отдаём ссылку на существующий разбор (deletedAt: null — удалённый
  // можно загрузить заново).
  const duplicate = await prisma.tournament.findFirst({
    where: { playerId, room, externalTournamentId, deletedAt: null },
    select: { id: true },
  });

  if (duplicate) {
    return { ok: false, error: "DUPLICATE", existingTournamentId: duplicate.id };
  }

  const tournament = await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.create({
      data: {
        playerId,
        playedAt: new Date(playedAt), // реальная дата турнира из HH, не момент загрузки
        room,
        name,
        externalTournamentId,
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
