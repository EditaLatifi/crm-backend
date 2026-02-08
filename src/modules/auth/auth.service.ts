
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

// Dummy user for demonstration (with bcrypt hash)
const DUMMY_USER = {
  id: 'cb7f8ad0-1499-43b3-ab05-8e9dac1a176f',
  email: 'admin@example.com',
  password: bcrypt.hashSync('admin123', 10),
  role: 'ADMIN',
};

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async validateUser(email: string, password: string) {
    if (email === DUMMY_USER.email) {
      const isMatch = await bcrypt.compare(password, DUMMY_USER.password);
      if (isMatch) {
        const { password, ...user } = DUMMY_USER;
        return user;
      }
    }
    return null;
  }

  async login(user: any) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    return {
      access_token: this.jwtService.sign(payload, { expiresIn: '15m' }),
      user,
    };
  }

  async refresh(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      // Optionally check if token is blacklisted
      const { password, ...user } = DUMMY_USER;
      return this.login(user);
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
