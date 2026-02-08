import { Role } from '@prisma/client';

export function canAccessActivity(user: { id: string; role: Role }, entity: { ownerUserId?: string; createdByUserId?: string; assignedToUserId?: string; userId?: string }): boolean {
  if (user.role === 'ADMIN') return true;
  return (
    entity.ownerUserId === user.id ||
    entity.createdByUserId === user.id ||
    entity.assignedToUserId === user.id ||
    entity.userId === user.id
  );
}