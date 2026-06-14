// Применяет неприменённые миграции БД при старте production-сервера.
// Автодеплой на VM (~/deploy.sh) делает git pull → npm install → build → pm2 restart,
// без отдельного шага `prisma migrate deploy` — этот хук закрывает разрыв.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;

  const { execSync } = await import("node:child_process");
  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
  } catch (error) {
    console.error("prisma migrate deploy failed at startup", error);
  }
}
