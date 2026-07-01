import { createHmac } from "crypto";
import type { ParsedTournament } from "@/parser/types";

// Обезличенный СТАБИЛЬНЫЙ токен оппонента в рамках ОДНОГО турнира: одинаковый для
// одного человека во всех его раздачах этого турнира — для внутренней склейки раздач
// при подсчёте профиля (parser/opponent-profile.ts). Но это НЕ его ник: односторонний
// HMAC с серверным секретом, обратно в ник не раскрутить даже с доступом к базе.
//
// Приватность (architecture/07-безопасность.md): реальный ник НИГДЕ не сохраняем — хешируем
// здесь, в инфра-слое (парсер чистый, сырой ник живёт только в памяти шага разбора). Токен
// НЕ уходит в Claude (метка «Player N» остаётся для промпта) — только для внутренней логики.
// Секрет берём из SESSION_SECRET (уже обязателен для сессий).
export function opponentToken(rawName: string, tournamentId: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET не задан");
  return createHmac("sha256", secret)
    .update(`opp:${tournamentId}:${rawName}`)
    .digest("base64url")
    .slice(0, 16);
}

// Проставляет opponentToken в места всех раздач турнира по транзитным именам мест
// (seatNames) и УДАЛЯЕТ сырые имена. Вызывать в точке разбора (features/tournaments)
// ДО постановки задачи в очередь — чтобы сырой ник не осел в payload/tasks (приватность:
// в БД и наружу идёт только токен, ник живёт лишь в памяти на этот вызов). Мутирует data.
export function applyOpponentTokens(data: ParsedTournament): void {
  for (const h of data.hands) {
    const names = h.seatNames;
    if (names) {
      for (const seat of h.tableSnapshot.seats) {
        const name = seat.seatNumber != null ? names[seat.seatNumber] : undefined;
        if (seat.label !== "Hero" && name) {
          seat.opponentToken = opponentToken(name, data.externalTournamentId);
        }
      }
    }
    delete h.seatNames; // сырые ники дальше не едут
  }
}
