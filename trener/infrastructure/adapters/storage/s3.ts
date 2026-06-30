import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getS3Config } from "@/config/storage";
import type { StoragePort } from "./types";

// Адаптер на Yandex Object Storage (S3-совместимое). forcePathStyle — Yandex принимает
// адрес вида endpoint/bucket/key. Клиент создаём лениво и кэшируем на процесс.
let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  const c = getS3Config();
  client = new S3Client({
    endpoint: c.endpoint,
    region: c.region,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    forcePathStyle: true,
  });
  return client;
}

export const s3StorageAdapter: StoragePort = {
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await getClient().send(
      new PutObjectCommand({ Bucket: getS3Config().bucket, Key: key, Body: body, ContentType: contentType }),
    );
  },
};
