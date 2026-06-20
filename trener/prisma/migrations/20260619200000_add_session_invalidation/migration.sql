-- Инвалидация сессий при смене пароля и «выходе на всех устройствах».
-- password_changed_at — момент последней смены пароля (для показа в кабинете).
-- sessions_valid_from — служебная метка: cookie с iat раньше неё считается недействительным.
-- IF NOT EXISTS — миграция применяется и в dev, и в тестовую базу вручную (db execute),
-- из-за давнего drift между историей миграций и dev-базой (см. журнал 03-база-данных.md).

-- AlterTable
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "password_changed_at" TIMESTAMP(3);
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "sessions_valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Существующим игрокам метку ставим в момент их регистрации: текущие куки выданы
-- позже регистрации (iat >= created_at), поэтому остаются валидными — деплой никого
-- не разлогинивает. Новые игроки получают DEFAULT now() при создании строки.
UPDATE "players" SET "sessions_valid_from" = "created_at";
