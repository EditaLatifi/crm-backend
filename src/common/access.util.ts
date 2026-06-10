import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

// Management = ADMIN or PROJEKTLEITER. Internal = any role except EXTERN.
export const isManager = (role?: Role | string | null): boolean =>
  role === Role.ADMIN || role === Role.PROJEKTLEITER;

export const isInternal = (role?: Role | string | null): boolean =>
  !!role && role !== Role.EXTERN;

/** Throw 403 unless the user is an internal staff member (blocks EXTERN). */
export function assertInternal(user: any): void {
  if (!isInternal(user?.role)) throw new ForbiddenException('Zugriff verweigert');
}

/** Throw 403 unless the user is management (ADMIN or PROJEKTLEITER). */
export function assertManager(user: any): void {
  if (!isManager(user?.role)) throw new ForbiddenException('Zugriff verweigert');
}

/** Throw 403 unless the user is management, or the owner/creator of the record. */
export function assertManagerOrOwner(user: any, ...ownerIds: Array<string | null | undefined>): void {
  if (isManager(user?.role)) return;
  if (user?.userId && ownerIds.some((o) => o && o === user.userId)) return;
  throw new ForbiddenException('Zugriff verweigert');
}
