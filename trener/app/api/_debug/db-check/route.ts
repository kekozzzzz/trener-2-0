import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/client";

// Временный диагностический эндпоинт — удалить после расследования
// server-side exception на /tournament/[id] (2026-06-14).
export async function GET(): Promise<NextResponse> {
  const result: Record<string, unknown> = {};

  try {
    const table = await prisma.$queryRawUnsafe<{ exists: string | null }[]>(
      "SELECT to_regclass('public.dialogue_rounds')::text AS exists",
    );
    result.dialogueRoundsTable = table[0]?.exists ?? null;
  } catch (error) {
    result.dialogueRoundsTableError = String(error);
  }

  try {
    const migrations = await prisma.$queryRawUnsafe<
      { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
    >(
      'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 8',
    );
    result.migrations = migrations;
  } catch (error) {
    result.migrationsError = String(error);
  }

  try {
    const { execSync } = await import("node:child_process");
    const output = execSync("npx prisma migrate deploy", { encoding: "utf-8" });
    result.migrateDeployOutput = output;
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    result.migrateDeployError = {
      message: err.message,
      stdout: err.stdout,
      stderr: err.stderr,
    };
  }

  return NextResponse.json(result);
}
