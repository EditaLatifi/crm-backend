-- Add VACATION_REQUESTED so a new vacation request can notify the admins (T3-10).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VACATION_REQUESTED';
