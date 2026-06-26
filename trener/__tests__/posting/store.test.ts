import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  loadPosts,
  addPost,
  getPost,
  dueForPreview,
  dueForPublish,
  setStatus,
} from "@/infrastructure/posting/store";
import type { QueuedPost } from "@/infrastructure/posting/types";

let dir: string;

function makePost(over: Partial<QueuedPost> = {}): QueuedPost {
  return {
    id: "sliv-01",
    imageFile: "sliv-01.png",
    caption: "Текст поста",
    scheduledAt: "2026-06-29T16:00:00.000Z",
    previewAt: "2026-06-28T16:00:00.000Z",
    status: "QUEUED",
    ...over,
  };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "post-queue-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("очередь постов (store)", () => {
  it("пустая очередь, если файла нет", () => {
    expect(loadPosts(dir)).toEqual([]);
  });

  it("добавляет и читает пост; повтор id обновляет, а не дублирует", () => {
    addPost(makePost(), dir);
    addPost(makePost({ caption: "новый текст" }), dir);
    const all = loadPosts(dir);
    expect(all).toHaveLength(1);
    expect(getPost("sliv-01", dir)?.caption).toBe("новый текст");
  });

  it("dueForPreview берёт только QUEUED с наступившим временем превью", () => {
    addPost(makePost({ id: "a", previewAt: "2026-06-28T16:00:00.000Z" }), dir);
    addPost(makePost({ id: "b", previewAt: "2026-07-10T16:00:00.000Z" }), dir); // ещё рано
    addPost(makePost({ id: "c", status: "APPROVED", previewAt: "2026-06-01T16:00:00.000Z" }), dir);
    const due = dueForPreview(new Date("2026-06-29T00:00:00.000Z"), dir);
    expect(due.map((p) => p.id)).toEqual(["a"]);
  });

  it("dueForPublish берёт только APPROVED с наступившим временем публикации", () => {
    addPost(makePost({ id: "a", status: "APPROVED", scheduledAt: "2026-06-29T16:00:00.000Z" }), dir);
    addPost(makePost({ id: "b", status: "QUEUED", scheduledAt: "2026-06-29T16:00:00.000Z" }), dir);
    addPost(makePost({ id: "c", status: "APPROVED", scheduledAt: "2026-07-20T16:00:00.000Z" }), dir);
    const due = dueForPublish(new Date("2026-06-29T17:00:00.000Z"), dir);
    expect(due.map((p) => p.id)).toEqual(["a"]);
  });

  it("setStatus меняет статус, ставит отметку времени и сохраняется на диск", () => {
    addPost(makePost(), dir);
    const now = new Date("2026-06-28T16:05:00.000Z");
    const updated = setStatus("sliv-01", "PREVIEW_SENT", now, dir);
    expect(updated?.status).toBe("PREVIEW_SENT");
    expect(updated?.previewSentAt).toBe(now.toISOString());
    // перечитали с диска — статус сохранён
    expect(getPost("sliv-01", dir)?.status).toBe("PREVIEW_SENT");
  });

  it("setStatus возвращает null для несуществующего id", () => {
    expect(setStatus("нет-такого", "APPROVED", new Date(), dir)).toBeNull();
  });
});
