// Публичный интерфейс модуля очереди.
// Импорт этого файла автоматически регистрирует все шаги через bootstrap.ts.
import "./bootstrap";

export { enqueue } from "./enqueue";
export { runWorkerOnce } from "./worker";
export { registerStep } from "./registry";
