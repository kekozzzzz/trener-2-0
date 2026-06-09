-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('UPLOADED', 'PARSING', 'PARSED', 'CARD_READY', 'FAILED');

-- CreateEnum
CREATE TYPE "PlayerStyle" AS ENUM ('LOOSE', 'TIGHT', 'PASSIVE', 'AGGRESSIVE');

-- CreateEnum
CREATE TYPE "HandImportance" AS ENUM ('CRITICAL', 'STRONG', 'MEDIUM');

-- CreateEnum
CREATE TYPE "DialogueState" AS ENUM ('QUESTION_ASKED', 'ANSWER_RECEIVED', 'VERDICT_SHOWN');

-- CreateEnum
CREATE TYPE "MessageAuthor" AS ENUM ('PLAYER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "players" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "password_hash" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_profiles" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "avg_vpip" DECIMAL(5,2),
    "avg_result_buyins" DECIMAL(8,2),
    "avg_hands_count" DECIMAL(8,2),
    "tournaments_counted" INTEGER NOT NULL DEFAULT 0,
    "recalculated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "played_at" TIMESTAMP(3) NOT NULL,
    "vpip_percent" DECIMAL(5,2),
    "hands_count" INTEGER,
    "result_buyins" DECIMAL(8,2),
    "style_diagnosis" "PlayerStyle",
    "status" "TournamentStatus" NOT NULL DEFAULT 'UPLOADED',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hh_files" (
    "id" UUID NOT NULL,
    "tournament_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "purged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hh_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hands" (
    "id" UUID NOT NULL,
    "tournament_id" UUID NOT NULL,
    "importance_level" "HandImportance" NOT NULL,
    "chip_result" INTEGER NOT NULL,
    "table_data" JSONB NOT NULL,
    "analysis" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dialogues" (
    "id" UUID NOT NULL,
    "hand_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "verdict" TEXT,
    "state" "DialogueState" NOT NULL DEFAULT 'QUESTION_ASKED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dialogues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "hand_id" UUID NOT NULL,
    "author" "MessageAuthor" NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "plan_code" TEXT NOT NULL,
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "next_payment_at" TIMESTAMP(3),
    "external_subscription_id" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "external_payment_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_email_key" ON "players"("email");

-- CreateIndex
CREATE UNIQUE INDEX "player_profiles_player_id_key" ON "player_profiles"("player_id");

-- CreateIndex
CREATE INDEX "idx_tournaments_pending_parse" ON "tournaments"("status", "created_at");

-- CreateIndex
CREATE INDEX "idx_tournaments_player_timeline" ON "tournaments"("player_id", "played_at");

-- CreateIndex
CREATE INDEX "idx_tournaments_player_monthly_count" ON "tournaments"("player_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "hh_files_tournament_id_key" ON "hh_files"("tournament_id");

-- CreateIndex
CREATE INDEX "idx_hh_files_purge_candidates" ON "hh_files"("purged_at");

-- CreateIndex
CREATE INDEX "idx_hands_tournament_card" ON "hands"("tournament_id", "importance_level");

-- CreateIndex
CREATE UNIQUE INDEX "dialogues_hand_id_key" ON "dialogues"("hand_id");

-- CreateIndex
CREATE INDEX "idx_chat_messages_thread" ON "chat_messages"("hand_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_player_id_key" ON "subscriptions"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_external_subscription_id_key" ON "subscriptions"("external_subscription_id");

-- CreateIndex
CREATE INDEX "idx_subscriptions_renewal_check" ON "subscriptions"("status", "next_payment_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_external_payment_id_key" ON "payments"("external_payment_id");

-- AddForeignKey
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hh_files" ADD CONSTRAINT "hh_files_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hands" ADD CONSTRAINT "hands_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialogues" ADD CONSTRAINT "dialogues_hand_id_fkey" FOREIGN KEY ("hand_id") REFERENCES "hands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_hand_id_fkey" FOREIGN KEY ("hand_id") REFERENCES "hands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
