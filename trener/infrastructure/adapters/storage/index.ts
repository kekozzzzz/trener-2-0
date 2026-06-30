import { isStorageConfigured } from "@/config/storage";
import { s3StorageAdapter } from "./s3";
import { noopStorageAdapter } from "./noop";
import type { StoragePort } from "./types";

// S3, если хранилище настроено (есть адрес, бакет и ключи), иначе noop (дев/тесты).
export function getStorageAdapter(): StoragePort {
  return isStorageConfigured() ? s3StorageAdapter : noopStorageAdapter;
}

// Мягкая запись для мест, где сохранение вторично и не должно ронять основную работу
// (загрузка турнира): не удалось положить — пишем в лог и возвращаем false. Вызывающий
// решает, что делать (например, не проставлять storageKey в записи БД).
export async function safeStore(key: string, body: Buffer, contentType: string): Promise<boolean> {
  try {
    await getStorageAdapter().put(key, body, contentType);
    return true;
  } catch (err) {
    console.error("[storage] не удалось сохранить объект:", err);
    return false;
  }
}

export type { StoragePort } from "./types";
