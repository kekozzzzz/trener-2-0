// Краткая сводка готового разбора раздачи — передаётся в GENERATE_CHAT_REPLY
// как контекст «что уже разобрано», без повторных вычислений (правило 1).

type HandAnalysis = {
  played: string;
  optimal: string;
};

export function buildAnalysisSummary(analysis: HandAnalysis, verdict: string | null): string {
  const parts = [`Как сыграл Hero: ${analysis.played}`, `Оптимальная линия: ${analysis.optimal}`];
  if (verdict) parts.push(`Итоговый вердикт после диалога: ${verdict}`);
  return parts.join("\n");
}
