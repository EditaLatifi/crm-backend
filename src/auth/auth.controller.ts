import { Controller, Post, Body, Request, UseGuards, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: any): Promise<any> {
    const { email, password } = body;
    const user = await this.authService.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException('Ungültige E-Mail-Adresse oder Passwort');
    }
    return this.authService.login(user);
  }

  // Refresh: requires a valid (non-expired) JWT, returns a fresh one
  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  async refresh(@Request() req: any) {
    const user = await this.authService.getUserById(req.user.userId);
    if (!user) throw new UnauthorizedException();
    return this.authService.login(user);
  }
}
