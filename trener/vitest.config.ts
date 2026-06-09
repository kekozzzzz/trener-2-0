import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 15000,
    env: {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/trener_test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
