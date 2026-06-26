import fs from "fs";
import path from "path";
import { getPostQueueDir } from "@/config/posting";
import type { QueuedPost, PostStatus } from "./types";

// Файловое хранилище очереди постов. Простое read-modify-write по queue.json в каталоге
// очереди (на сервере — вне git). Объём крошечный (несколько постов в неделю), поэтому
// без БД: проще, не требует миграции схемы. Запись атомарна (tmp + rename), чтобы cron и
// webhook не получили полуфайл. Все функции принимают каталог явно — это делает их
// тестируемыми на временной папке; обёртки в самом приложении берут каталог из конфига.

function queueFilePath(dir: string): string {
  return path.join(dir, "queue.json");
}

// Прочитать очередь. Нет файла или битый JSON — пустая очередь (постинг просто молчит).
export function loadPosts(dir: string = getPostQueueDir()): QueuedPost[] {
  const file = queueFilePath(dir);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? (parsed as QueuedPost[]) : [];
  } catch {
    return [];
  }
}

// Записать очередь целиком (атомарно).
function savePosts(dir: string, posts: QueuedPost[]): void {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = queueFilePath(dir) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(posts, null, 2), "utf8");
  fs.renameSync(tmp, queueFilePath(dir));
}

export function getPost(id: string, dir: string = getPostQueueDir()): QueuedPost | null {
  return loadPosts(dir).find((p) => p.id === id) ?? null;
}

// Добавить пост в очередь. Дубликат id — обновляет существующий (идемпотентно при
// повторном наполнении). Возвращает добавленный пост.
export function addPost(post: QueuedPost, dir: string = getPostQueueDir()): QueuedPost {
  const posts = loadPosts(dir);
  const idx = posts.findIndex((p) => p.id === post.id);
  if (idx >= 0) posts[idx] = post;
  else posts.push(post);
  savePosts(dir, posts);
  return post;
}

function atMs(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : Infinity; // битая дата не «наступает» никогда
}

// Посты, которым пора слать превью: в очереди (QUEUED) и время превью наступило.
export function dueForPreview(now: Date, dir: string = getPostQueueDir()): QueuedPost[] {
  const nowMs = now.getTime();
  return loadPosts(dir).filter((p) => p.status === "QUEUED" && atMs(p.previewAt) <= nowMs);
}

// Посты, которым пора публиковаться: одобрены (APPROVED) и время публикации наступило.
export function dueForPublish(now: Date, dir: string = getPostQueueDir()): QueuedPost[] {
  const nowMs = now.getTime();
  return loadPosts(dir).filter((p) => p.status === "APPROVED" && atMs(p.scheduledAt) <= nowMs);
}

// Сменить статус поста и проставить отметку времени перехода. Возвращает обновлённый
// пост или null, если id не найден. now передаётся явно (тестируемость).
export function setStatus(
  id: string,
  status: PostStatus,
  now: Date,
  dir: string = getPostQueueDir(),
): QueuedPost | null {
  const posts = loadPosts(dir);
  const post = posts.find((p) => p.id === id);
  if (!post) return null;
  post.status = status;
  const iso = now.toISOString();
  if (status === "PREVIEW_SENT") post.previewSentAt = iso;
  else if (status === "APPROVED") post.approvedAt = iso;
  else if (status === "HELD") post.heldAt = iso;
  else if (status === "PUBLISHED") post.publishedAt = iso;
  savePosts(dir, posts);
  return post;
}
