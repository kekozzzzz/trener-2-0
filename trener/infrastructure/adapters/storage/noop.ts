import type { StoragePort } from "./types";

// Заглушка: хранилище не настроено (дев/тесты) — файлы никуда не кладём, молча ок.
export const noopStorageAdapter: StoragePort = {
  async put(): Promise<void> {
    /* no-op */
  },
};
