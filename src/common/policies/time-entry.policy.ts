import { Role } from '@prisma/client';

export function canAccessTimeEntry(user: { id: string; role: Role }, timeEntry: { userId: string }): boolean {
  if (user.role === 'ADMIN') return true;
  return timeEntry.userId === user.id;
}