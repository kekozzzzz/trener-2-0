import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 15000,
    // Тесты используют общую БД — параллельное выполнение файлов вызывает интерференцию.
    fileParallelism: false,
    env: {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/trener_test",
      // По умолчанию 1 раунд — тесты без явного интереса к многораундовому
      // диалогу остаются написаны "как для одного раунда" (round 1 = последний).
      DIALOGUE_ROUNDS_PER_HAND: "1",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
