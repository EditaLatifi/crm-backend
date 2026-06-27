-- Carry the Mehrkosten flag on a running timer so timer-based bookings are not silently
-- written as non-extra and wrongly deducted from the phase Kontingent (S1/billing fix).
ALTER TABLE "RunningTimer" ADD COLUMN IF NOT EXISTS "isBillableExtra" BOOLEAN NOT NULL DEFAULT false;
