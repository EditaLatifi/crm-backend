-- Add new NotificationType enum values for Follow-up integration
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FOLLOW_UP_CREATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FOLLOW_UP_DUE';
