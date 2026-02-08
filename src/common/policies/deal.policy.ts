import { Role } from '@prisma/client';

export function canAccessDeal(user: { id: string; role: Role }, deal: { ownerUserId: string; createdByUserId: string }): boolean {
  if (user.role === 'ADMIN') return true;
  return deal.ownerUserId === user.id || deal.createdByUserId === user.id;
}