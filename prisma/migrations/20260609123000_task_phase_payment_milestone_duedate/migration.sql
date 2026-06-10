-- Task: payment reminder flag (D)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "isPaymentReminder" BOOLEAN NOT NULL DEFAULT false;

-- Task: primary phase link as FK to ProjectPhase (E)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "projectPhaseId" TEXT;
CREATE INDEX IF NOT EXISTS "Task_projectPhaseId_idx" ON "Task"("projectPhaseId");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_projectPhaseId_fkey') THEN
    ALTER TABLE "Task"
      ADD CONSTRAINT "Task_projectPhaseId_fkey"
      FOREIGN KEY ("projectPhaseId") REFERENCES "ProjectPhase"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ProjectMilestone: support ad-hoc per-project milestones with name + due date (F)
ALTER TABLE "ProjectMilestone" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "ProjectMilestone" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
ALTER TABLE "ProjectMilestone" ALTER COLUMN "milestoneId" DROP NOT NULL;
ALTER TABLE "ProjectMilestone" DROP CONSTRAINT IF EXISTS "ProjectMilestone_projectId_milestoneId_key";
