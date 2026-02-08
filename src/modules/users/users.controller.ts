import { Controller, Get, Param, UseGuards, Patch, Body, Request, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Role } from '../../auth/role.decorator';

@Controller('users')
export class UsersController {
    @Get()
    @UseGuards(JwtAuthGuard)
    async getAll(@Request() req: any): Promise<any[]> {
      // Only allow admin
      console.log('[GET /users] req.user:', req.user);
      if (req.user?.role !== 'ADMIN') {
        console.log('[GET /users] Not admin, returning []');
        return [];
      }
      const users = await this.usersService.findAll();
      console.log('[GET /users] Returning users:', users);
      return users;
    }

    @Post()
    @UseGuards(JwtAuthGuard)
    async createUser(@Body() body: any, @Request() req: any): Promise<any> {
      // Only allow admin
      if (req.user?.role !== 'ADMIN') {
        return { error: 'Access denied' };
      }
      // Accept email, name, role, password
      const { email, name, role, password } = body;
      if (!email || !name || !role || !password) {
        return { error: 'Missing fields' };
      }
      return this.usersService.createUser({ email, name, role, password });
    }
  constructor(private readonly usersService: UsersService) {}

  @Post('me')
  @UseGuards(JwtAuthGuard)
  async me(@Request() req: any): Promise<any> {
    // req.user is set by JwtAuthGuard
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return { error: 'User not authenticated' };
    }
    const user = await this.usersService.findById(userId);
    if (!user) {
      return { error: 'User not found' };
    }
    return user;
  }
}
