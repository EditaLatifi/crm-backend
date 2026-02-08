import { Role } from '@prisma/client';

export function canAccessTask(user: { id: string; role: Role }, task: { assignedToUserId: string; createdByUserId: string }): boolean {
  if (user.role === 'ADMIN') return true;
  return task.assignedToUserId === user.id || task.createdByUserId === user.id;
}