-- Task archiving: hide a task from the active board without deleting it.
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Task_archivedAt_idx" ON "Task"("archivedAt");
