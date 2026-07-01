import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 15000,
    // Глобальный мок i18n-границы (next-intl/server) для всех тестов — см. __tests__/setup.ts.
    // Серверные экшены переводят тексты ошибок через getTranslations, которому в юнит-тестах
    // не хватает контекста запроса; мок отдаёт русский текст из словаря.
    setupFiles: ["./__tests__/setup.ts"],
    // Тесты используют общую БД — параллельное выполнение файлов вызывает интерференцию.
    fileParallelism: false,
    env: {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/trener_test",
      // По умолчанию 1 раунд — тесты без явного интереса к многораундовому
      // диалогу остаются написаны "как для одного раунда" (round 1 = последний).
      DIALOGUE_ROUNDS_PER_HAND: "1",
      SESSION_SECRET: "test-session-secret-for-tests-only",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
