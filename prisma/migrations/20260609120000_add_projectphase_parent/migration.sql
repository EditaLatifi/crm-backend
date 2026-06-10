-- AlterTable: add self-referential parent for ProjectPhase sub-phases
ALTER TABLE "ProjectPhase" ADD COLUMN IF NOT EXISTS "parentPhaseId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProjectPhase_parentPhaseId_idx" ON "ProjectPhase"("parentPhaseId");

-- AddForeignKey (sub-phases are deleted with their parent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProjectPhase_parentPhaseId_fkey'
  ) THEN
    ALTER TABLE "ProjectPhase"
      ADD CONSTRAINT "ProjectPhase_parentPhaseId_fkey"
      FOREIGN KEY ("parentPhaseId") REFERENCES "ProjectPhase"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
