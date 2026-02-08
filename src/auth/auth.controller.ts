import { Controller, Post, Body, Request, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './local-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: any): Promise<any> {
    const { email, password } = body;
    const user = await this.authService.validateUser(email, password);
    if (!user) {
      return { error: 'Invalid credentials' };
    }
    // Get access token
    const loginResult = await this.authService.login(user);
    return {
      ...loginResult, // includes access_token
      user,
    };
  }
  // Removed refresh endpoint
}
