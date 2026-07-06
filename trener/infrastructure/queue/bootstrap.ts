// Регистрация всех шагов pipeline.
// Добавить новый шаг: import + одна строка registerStep.
// Этот файл — единственный, который знает о конкретных шагах.

import { registerStep } from "./registry";
import { noopStep } from "./steps/noop";
import { parseTournamentStep } from "./steps/parse-tournament";
import { generateHandAnalysisStep } from "./steps/generate-hand-analysis";
import { generateDialogueQuestionStep } from "./steps/generate-dialogue-question";
import { generateVerdictStep } from "./steps/generate-verdict";
import { generateChatReplyStep } from "./steps/generate-chat-reply";
import { generateTournamentSummaryStep } from "./steps/generate-tournament-summary";
import { generatePlayerCharacteristicStep } from "./steps/generate-player-characteristic";
import { updateCoachNotesStep } from "./steps/update-coach-notes";
import { renewSubscriptionStep } from "./steps/renew-subscription";

registerStep("NOOP", noopStep);
registerStep("PARSE_TOURNAMENT", parseTournamentStep);
registerStep("GENERATE_HAND_ANALYSIS", generateHandAnalysisStep);
registerStep("GENERATE_DIALOGUE_QUESTION", generateDialogueQuestionStep);
registerStep("GENERATE_VERDICT", generateVerdictStep);
registerStep("GENERATE_CHAT_REPLY", generateChatReplyStep);
registerStep("GENERATE_TOURNAMENT_SUMMARY", generateTournamentSummaryStep);
registerStep("GENERATE_PLAYER_CHARACTERISTIC", generatePlayerCharacteristicStep);
registerStep("UPDATE_COACH_NOTES", updateCoachNotesStep);
registerStep("RENEW_SUBSCRIPTION", renewSubscriptionStep);
