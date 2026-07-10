-- «Ориентир»: самооценка игроком уровня понимания покера (NEW|BASICS|CONFIDENT|DEEP),
-- NULL = не выбрано. Мягкий приор для тона тренера на первые турниры.
-- План: plans/2026-07-10-ориентир-уровень-игрока.md
ALTER TABLE "players" ADD COLUMN "self_level" TEXT;
