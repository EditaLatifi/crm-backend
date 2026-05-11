import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../modules/users/users.service';
import { EmailService } from '../modules/email/email.service';
import { PrismaService } from '../common/prisma.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private email: EmailService,
    private prisma: PrismaService,
  ) {}

  async validateUser(email: string, pass: string) {
    if (email === 'anonymous@crm.local') return null;
    const user = await this.usersService.findByEmail(email);
    if (user && await bcrypt.compare(pass, user.passwordHash)) {
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { sub: user.id, role: user.role };
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

    // Store token in DB (survives restarts)
    await (this.prisma as any).passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 3600_000), // 1 hour
      },
    });

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
    const entry = await (this.prisma as any).passwordResetToken.findUnique({ where: { token } });
    if (!entry || entry.expiresAt < new Date()) {
      throw new BadRequestException('Token ungültig oder abgelaufen');
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await this.usersService.updatePasswordHash(entry.userId, hash);
    // Delete used token + any expired tokens for this user
    await (this.prisma as any).passwordResetToken.deleteMany({
      where: { OR: [{ token }, { userId: entry.userId }, { expiresAt: { lt: new Date() } }] },
    });
  }
}
