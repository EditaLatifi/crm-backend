import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

// Role hierarchy: ADMIN > PROJEKTLEITER > MITARBEITER/USER > EXTERN
const ROLE_LEVEL: Record<string, number> = {
  ADMIN: 100,
  PROJEKTLEITER: 75,
  MITARBEITER: 50,
  USER: 50, // backward compat: USER = MITARBEITER
  EXTERN: 25,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRole = this.reflector.getAllAndOverride<string>('role', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRole) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Insufficient role');
    }
    const userLevel = ROLE_LEVEL[user.role] ?? 0;
    const requiredLevel = ROLE_LEVEL[requiredRole] ?? 0;
    if (userLevel < requiredLevel) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
