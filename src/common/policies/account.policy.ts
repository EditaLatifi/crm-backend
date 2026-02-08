import { Role } from '@prisma/client';

export function canAccessAccount(
  user: { id: string; role: Role },
  account: { ownerUserId: string | null; createdByUserId: string }
): boolean {
  if (user.role === 'ADMIN') return true;
  return account.ownerUserId === user.id || account.createdByUserId === user.id;
}