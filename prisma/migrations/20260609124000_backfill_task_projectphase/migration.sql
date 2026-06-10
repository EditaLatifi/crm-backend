-- Backfill Task.projectPhaseId for existing project tasks by matching the SIA code (E).
-- Only touches tasks that belong to a project, have no FK yet, and whose phase code
-- matches exactly one project phase code within the same project.
UPDATE "Task" t
SET "projectPhaseId" = pp.id
FROM "ProjectPhase" pp
WHERE t."projectId" IS NOT NULL
  AND t."projectPhaseId" IS NULL
  AND t."phase" IS NOT NULL
  AND pp."projectId" = t."projectId"
  AND pp."code" = t."phase";
