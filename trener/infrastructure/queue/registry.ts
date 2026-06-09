import type { StepHandler } from "./types";

// Реестр шагов pipeline. Ключ — строковый тип задачи (Task.type).
// Добавить новый шаг = новый файл в steps/ + одна строка registerStep() в bootstrap.ts.
// Старый код не трогается.
const handlers = new Map<string, StepHandler>();

export function registerStep(type: string, handler: StepHandler): void {
  handlers.set(type, handler);
}

export function getHandler(type: string): StepHandler | undefined {
  return handlers.get(type);
}
