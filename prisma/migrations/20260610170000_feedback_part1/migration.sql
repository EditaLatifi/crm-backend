-- Project type categories (IP3) — additive enum values
ALTER TYPE "ProjectType" ADD VALUE IF NOT EXISTS 'ARCHITEKTUR_UND_BAULEITUNG';
ALTER TYPE "ProjectType" ADD VALUE IF NOT EXISTS 'PROJEKTLEITUNG';
ALTER TYPE "ProjectType" ADD VALUE IF NOT EXISTS 'GENERALPLANER';

-- Task: Mehrkosten flag (hours billed extra, not deducted from phase Kontingent)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "isBillableExtra" BOOLEAN NOT NULL DEFAULT false;

-- ProjectMilestone: Baufortschritt start/end dates
ALTER TABLE "ProjectMilestone" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "ProjectMilestone" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
