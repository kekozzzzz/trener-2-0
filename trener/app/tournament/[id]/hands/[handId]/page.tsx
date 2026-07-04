import { prisma } from "@/infrastructure/db/client";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { getDialogue } from "@/features/dialogue/queries";
import { getChat } from "@/features/chat/queries";
import { bigBlindFromSnapshot } from "@/parser/big-blind";
import type { TableSnapshot } from "@/parser/types";
import { requireSession } from "@/features/auth/session";
import { personalizeHero } from "@/lib/hero-name";
import { AuthNav } from "@/components/auth-nav";
import { Wordmark } from "@/components/ui/wordmark";
import { AnswerForm } from "./answer-form";
import { RangeAnswerForm } from "./range-answer-form";
import { splitMarkers } from "@/config/dialogue";
import { HandTable } from "@/components/poker/hand-table";
import { tableStateUpTo, lastActionIndex, tableSignature } from "@/parser/table-state";
import { WaitClient } from "./wait-client";
import { ChatThread } from "./chat-thread";
import { ChatForm } from "./chat-form";
import { ChatWaitClient } from "./chat-wait-client";
import { MarkViewed } from "./mark-viewed";
import { ScrollToLatest } from "./scroll-to-latest";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function HandDialoguePage({
  params,
}: {
  params: Promise<{ id: string; handId: string }>;
}) {
  const { id, handId } = await params;
  const t = await getTranslations("HandReview");
  const session = await requireSession();

  const hand = await prisma.hand.findUnique({
    where: { id: handId },
    include: { tournament: true },
  });

  if (
    !hand ||
    hand.tournamentId !== id ||
    hand.tournament.playerId !== session.playerId ||
    hand.tournament.deletedAt
  ) {
    notFound();
  }

  // Ник игрока для показа вместо «Hero» (только отображение; в LLM не идёт).
  const me = await prisma.player.findUnique({
    where: { id: session.playerId },
    select: { nickname: true },
  });
  const nick = me?.nickname ?? null;

  const dialogue = await getDialogue(handId);

  // Кнопка после вердикта (правка Артёма 2026-07-04): ведём к следующей непройденной
  // критической раздаче турнира; когда пройдена последняя — к турниру.
  const nextCritical =
    dialogue?.state === "VERDICT_SHOWN"
      ? await prisma.hand.findFirst({
          where: {
            tournamentId: id,
            id: { not: handId },
            dialogue: { is: { state: { not: "VERDICT_SHOWN" } } },
          },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        })
      : null;

  // Разбор раздачи (played / optimal / note). У критических часть полей дублирует
  // диалог; у простых (STRONG/MEDIUM) — единственный источник для страницы.
  const analysis = hand.analysis as { played?: string; optimal?: string; note?: string } | null;

  // Страница доступна, если есть диалог (критическая) ИЛИ готовый разбор простой
  // раздачи карточки. Иначе: турнир заперт (метрики есть, разбор под замком) —
  // показываем замок со ссылкой на турнир; либо раздача не из карточки → 404.
  if (!dialogue && !analysis) {
    if (!hand.tournament.analysisUnlocked) {
      return (
        <main>
          <header className="border-b border-border">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
              <Link href="/">
                <Wordmark />
              </Link>
              <AuthNav />
            </div>
          </header>
          <section className="mx-auto max-w-5xl px-8 py-16">
            <h1 className="text-h1">{t("lockedTitle")}</h1>
            <p className="mt-4 max-w-2xl text-body text-muted-foreground">
              {t("lockedBody")}
            </p>
            <div className="mt-8 font-mono text-label uppercase tracking-label">
              <Link href={`/tournament/${id}`} className="text-muted-foreground transition-colors hover:text-foreground">
                {t("backToTournament")}
              </Link>
            </div>
          </section>
        </main>
      );
    }
    notFound();
  }

  const chat = await getChat(handId);

  const openRound =
    dialogue?.state === "QUESTION_ASKED" ? dialogue.rounds[dialogue.rounds.length - 1] : null;
  const historyRounds = dialogue ? (openRound ? dialogue.rounds.slice(0, -1) : dialogue.rounds) : [];
  const played = personalizeHero(dialogue?.hand.played ?? analysis?.played ?? null, nick);
  const chipResult = hand.chipResult;
  const chipSign = chipResult >= 0 ? "+" : "";
  const snapshot = hand.tableData as unknown as TableSnapshot;
  const bigBlind = bigBlindFromSnapshot(snapshot);
  const bbResult = bigBlind ? chipResult / bigBlind : null;

  // Стол перед каждым вопросом: новые диалоги несут метку действия {{table:N}} в
  // тексте вопроса. Если меток нет (старые диалоги / простые раздачи) — показываем
  // один общий стол на последнем действии раздачи (fallback).
  const dialogueHasTable = dialogue
    ? dialogue.rounds.some((round) => splitMarkers(round.question).tableActionIndex !== null)
    : false;
  const showFallbackTable = !dialogueHasTable;

  // Стол не повторяем под каждым вопросом: проходим раунды по порядку и помечаем
  // показ заново только там, где картинка стола изменилась (новая улица, ставка,
  // выбывший, другая точка решения). На неизменных вопросах стол не печатаем —
  // «висит» предыдущий. Считаем один раз для всего диалога, чтобы история и
  // открытый вопрос делили одну цепочку подписей.
  const showTableForRound = new Map<number, boolean>();
  if (dialogue) {
    let prevSig: string | null = null;
    for (const round of dialogue.rounds) {
      const { tableActionIndex } = splitMarkers(round.question);
      if (tableActionIndex === null) continue;
      const sig = tableSignature(tableStateUpTo(snapshot, tableActionIndex));
      if (sig !== prevSig) {
        showTableForRound.set(round.roundNumber, true);
        prevSig = sig;
      }
    }
  }

  return (
    <main>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
          <Link href="/">
            <Wordmark />
          </Link>
          <AuthNav />
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-8 py-16">
        {/* Фоновая отметка «просмотрено» при открытии разбора (см. mark-viewed.tsx). */}
        <MarkViewed handId={handId} />
        <h1 className="text-h1">{t("title")}</h1>

        <div className="mt-8 border border-border bg-card p-6">
          {played && <p className="text-body text-muted-foreground">{played}</p>}
          {bbResult !== null ? (
            <>
              <p
                className={cn(
                  "mt-4 font-mono text-display",
                  chipResult >= 0 ? "text-primary" : "text-foreground"
                )}
              >
                {chipSign}
                {bbResult.toFixed(1)} BB
              </p>
              <p className="mt-1 font-mono text-small text-muted-foreground">
                {chipSign}
                {chipResult} {t("chips")}
              </p>
            </>
          ) : (
            <>
              <p
                className={cn(
                  "mt-4 font-mono text-display",
                  chipResult >= 0 ? "text-primary" : "text-foreground"
                )}
              >
                {chipSign}
                {chipResult}
              </p>
              <p className="mt-1 font-mono text-label uppercase tracking-label text-muted-foreground">{t("chips")}</p>
            </>
          )}
        </div>

        {showFallbackTable && (
          <div className="mt-8">
            <HandTable state={tableStateUpTo(snapshot, lastActionIndex(snapshot))} nick={nick} />
          </div>
        )}

        {historyRounds.length > 0 && (
          <div className="mt-16 space-y-8">
            <h2 className="text-h2">{t("historyTitle")}</h2>
            {historyRounds.map((round) => {
              const { tableActionIndex, text } = splitMarkers(round.question);
              return (
                <div key={round.roundNumber} className="space-y-2">
                  <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
                    {t("questionLabel", { number: round.roundNumber })}
                  </p>
                  {tableActionIndex !== null && showTableForRound.get(round.roundNumber) && (
                    <HandTable state={tableStateUpTo(snapshot, tableActionIndex)} nick={nick} />
                  )}
                  <p className="text-body text-foreground">{personalizeHero(text, nick)}</p>
                  <div className="border border-border bg-card p-4">
                    <p className="text-body text-muted-foreground">{round.answer}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {dialogue && (
          <div className="mt-16">
            {dialogue.state === "QUESTION_ASKED" && openRound && (() => {
              const { isRange, tableActionIndex, text } = splitMarkers(openRound.question);
              return (
                <>
                <ScrollToLatest handId={handId} />
                <div className="space-y-2">
                  <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
                    {t("questionLabel", { number: openRound.roundNumber })}
                  </p>
                  {tableActionIndex !== null && showTableForRound.get(openRound.roundNumber) && (
                    <HandTable state={tableStateUpTo(snapshot, tableActionIndex)} nick={nick} />
                  )}
                  <p className="text-h3 text-foreground">{personalizeHero(text, nick)}</p>
                  {isRange ? (
                    <RangeAnswerForm tournamentId={id} handId={handId} />
                  ) : (
                    <AnswerForm tournamentId={id} handId={handId} />
                  )}
                </div>
                </>
              );
            })()}

            {dialogue.state === "ANSWER_RECEIVED" && <WaitClient handId={handId} />}

            {dialogue.state === "VERDICT_SHOWN" && (
              <div className="space-y-4">
                <ScrollToLatest handId={handId} />
                <h2 className="text-h2">{t("verdictTitle")}</h2>
                <div className="border border-primary bg-card p-6">
                  <p className="text-body text-foreground">{personalizeHero(dialogue.verdict, nick)}</p>
                </div>
                <Link
                  href={nextCritical ? `/tournament/${id}/hands/${nextCritical.id}` : `/tournament/${id}`}
                  className={cn(buttonVariants(), "inline-flex")}
                >
                  {nextCritical ? t("nextCritical") : t("toTournament")}
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Простая раздача (без сократовского диалога): показываем разбор сразу. */}
        {!dialogue && analysis && (
          <div className="mt-16 space-y-4">
            <h2 className="text-h2">{t("reviewTitle")}</h2>
            {analysis.optimal && (
              <div className="space-y-2">
                <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
                  {t("howItCouldBe")}
                </p>
                <p className="text-body text-foreground">{personalizeHero(analysis.optimal, nick)}</p>
              </div>
            )}
            {analysis.note && (
              <div className="border border-border bg-card p-6">
                <p className="text-body text-muted-foreground">{personalizeHero(analysis.note, nick)}</p>
              </div>
            )}
          </div>
        )}

        {chat?.available && (
          <div className="mt-16 space-y-4">
            <h2 className="text-h2">{t("chatTitle")}</h2>
            {chat.messages.length > 0 && (
              <ChatThread
                messages={chat.messages.map((m) => ({ ...m, text: personalizeHero(m.text, nick) }))}
              />
            )}
            {chat.awaitingReply ? <ChatWaitClient handId={handId} /> : <ChatForm tournamentId={id} handId={handId} />}
          </div>
        )}

        <div className="mt-16 border-t border-border pt-8 font-mono text-label uppercase tracking-label">
          <Link href={`/tournament/${id}`} className="text-muted-foreground transition-colors hover:text-foreground">
            {t("backToTournament")}
          </Link>
        </div>
      </section>
    </main>
  );
}
