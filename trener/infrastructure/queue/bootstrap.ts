// Регистрация всех шагов pipeline.
// Добавить новый шаг: import + одна строка registerStep.
// Этот файл — единственный, который знает о конкретных шагах.

import { registerStep } from "./registry";
import { noopStep } from "./steps/noop";
import { parseTournamentStep } from "./steps/parse-tournament";

registerStep("NOOP", noopStep);
registerStep("PARSE_TOURNAMENT", parseTournamentStep);
