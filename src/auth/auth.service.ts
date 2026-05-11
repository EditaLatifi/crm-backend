import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../modules/users/users.service';
import { EmailService } from '../modules/email/email.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

// In-memory reset token store (simple, no extra DB model needed)
const resetTokens = new Map<string, { userId: string; expiresAt: number }>();

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private email: EmailService,
  ) {}

  async validateUser(email: string, pass: string) {
    if (email === 'anonymous@crm.local') return null; // Block anonymous login
    const user = await this.usersService.findByEmail(email);
    if (user && await bcrypt.compare(pass, user.passwordHash)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { sub: user.id, role: user.role };
    // Update lastLoginAt
    this.usersService.updateLastLogin(user.id).catch(() => {});
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
  async getUserById(id: string) {
    return this.usersService.findById(id);
  }

  async requestPasswordReset(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) return; // Don't reveal if user exists
    const token = crypto.randomBytes(32).toString('hex');
    resetTokens.set(token, { userId: user.id, expiresAt: Date.now() + 3600_000 }); // 1 hour
    const link = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    this.email.send({
      to: user.email,
      subject: 'Passwort zurücksetzen – IP3 CRM',
      text: `Hallo ${user.name},\n\nKlicke auf den folgenden Link, um dein Passwort zurückzusetzen:\n\n${link}\n\nDer Link ist 1 Stunde gültig.\n\nFalls du kein Passwort-Reset angefordert hast, ignoriere diese E-Mail.`,
      accountId: null,
      loggedByUserId: user.id,
      entityType: 'User',
      entityId: user.id,
    }).catch(() => {});
  }

  async resetPassword(token: string, newPassword: string) {
    const entry = resetTokens.get(token);
    if (!entry || entry.expiresAt < Date.now()) {
      throw new BadRequestException('Token ungültig oder abgelaufen');
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await this.usersService.updatePasswordHash(entry.userId, hash);
    resetTokens.delete(token);
  }
}
