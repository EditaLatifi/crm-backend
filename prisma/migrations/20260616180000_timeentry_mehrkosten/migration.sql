-- Mehrkosten moves from Task onto the TimeEntry (phase is the single time carrier).
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "isBillableExtra" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: an entry inherits the Mehrkosten flag from its linked task (if any).
UPDATE "TimeEntry" t
SET "isBillableExtra" = tk."isBillableExtra"
FROM "Task" tk
WHERE t."taskId" = tk."id" AND tk."isBillableExtra" = true;
