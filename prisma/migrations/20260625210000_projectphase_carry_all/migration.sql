-- S2 "carry ALL information" on Deal->Project conversion: ProjectPhase must be able to hold
-- the deal phase's due date and responsible person so nothing is dropped on convert.
ALTER TABLE "ProjectPhase" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
ALTER TABLE "ProjectPhase" ADD COLUMN IF NOT EXISTS "responsibleUserId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ProjectPhase_responsibleUserId_fkey'
  ) THEN
    ALTER TABLE "ProjectPhase"
      ADD CONSTRAINT "ProjectPhase_responsibleUserId_fkey"
      FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ProjectPhase_responsibleUserId_idx" ON "ProjectPhase"("responsibleUserId");
