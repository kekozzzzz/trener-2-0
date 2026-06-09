import type { StepHandler } from "../types";

// Заглушка для тестирования механики очереди.
// Немедленно завершается успехом — никакой реальной работы.
export const noopStep: StepHandler = async () => {};
