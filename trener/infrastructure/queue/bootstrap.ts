// Регистрация всех шагов pipeline.
// Добавить новый шаг: import + одна строка registerStep.
// Этот файл — единственный, который знает о конкретных шагах.

import { registerStep } from "./registry";
import { noopStep } from "./steps/noop";
import { parseTournamentStep } from "./steps/parse-tournament";
import { generateHandAnalysisStep } from "./steps/generate-hand-analysis";
import { generateVerdictStep } from "./steps/generate-verdict";

registerStep("NOOP", noopStep);
registerStep("PARSE_TOURNAMENT", parseTournamentStep);
registerStep("GENERATE_HAND_ANALYSIS", generateHandAnalysisStep);
registerStep("GENERATE_VERDICT", generateVerdictStep);
