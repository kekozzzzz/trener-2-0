// Конфигурация объектного хранилища (S3-совместимое, Yandex Object Storage) — для
// сохранения присланных файлов нераспознанного формата (образцы новых румов). Ключи
// и адрес живут только в .env (правило проекта №3, секреты в коде запрещены).
//
// Хранилище ОПЦИОНАЛЬНО: если не настроено (дев/тесты — переменных нет), выбирается
// noop-адаптер, продукт работает без него. Файлы приватные, авто-удаление через 90
// дней задано lifecycle-правилом бакета (отдельная чистка в коде не нужна).

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function getS3Config(): S3Config {
  return {
    endpoint: process.env.S3_ENDPOINT ?? "",
    region: process.env.S3_REGION ?? "ru-central1",
    bucket: process.env.S3_BUCKET ?? "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  };
}

// Предел ожидания одной операции с хранилищем (PutObject). У AWS SDK v3 по умолчанию
// таймаут запроса фактически не ограничен — зависшая загрузка держала бы лейн воркера
// (карточки автопостинга/образцы форматов кладутся из фоновых задач). В .env (правило 3).
const DEFAULT_STORAGE_CALL_TIMEOUT_MS = 20_000;
export function getStorageCallTimeoutMs(): number {
  const raw = Number(process.env.STORAGE_CALL_TIMEOUT_MS);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_STORAGE_CALL_TIMEOUT_MS;
}

// Хранилище считается настроенным, только когда есть адрес, бакет и оба ключа.
// Иначе — noop-адаптер (нераспознанные файлы просто не складываются).
export function isStorageConfigured(): boolean {
  const c = getS3Config();
  return c.endpoint !== "" && c.bucket !== "" && c.accessKeyId !== "" && c.secretAccessKey !== "";
}
