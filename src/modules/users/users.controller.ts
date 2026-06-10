import { Controller, Get, Param, Query, UseGuards, Patch, Delete, Body, Request, Post, HttpException, HttpStatus, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { isManager } from '../../common/access.util';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAll(@Request() req: any): Promise<any[]> {
    // Non-admins don't get the full user directory (returns empty rather than erroring; used by pickers).
    if (req.user?.role !== 'ADMIN') return [];
    return this.usersService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createUser(@Body() body: any, @Request() req: any): Promise<any> {
    if (req.user?.role !== 'ADMIN') throw new ForbiddenException('Access denied');
    const { email, name, role, password } = body;
    if (!email || !name || !role || !password) throw new HttpException('Missing fields', HttpStatus.BAD_REQUEST);
    return this.usersService.createUser({ email, name, role, password });
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateUser(@Param('id') id: string, @Body() body: any, @Request() req: any): Promise<any> {
    if (req.user?.role !== 'ADMIN') throw new ForbiddenException('Access denied');
    return this.usersService.updateUser(id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteUser(@Param('id') id: string, @Request() req: any): Promise<any> {
    if (req.user?.role !== 'ADMIN') throw new HttpException('Access denied', HttpStatus.FORBIDDEN);
    if (id === req.user?.userId) throw new HttpException('Eigenen Account kann nicht gelöscht werden', HttpStatus.BAD_REQUEST);
    return this.usersService.deleteUser(id);
  }

  @Post(':id/reset-password')
  @UseGuards(JwtAuthGuard)
  async resetPassword(@Param('id') id: string, @Body() body: any, @Request() req: any): Promise<any> {
    if (req.user?.role !== 'ADMIN') throw new HttpException('Access denied', HttpStatus.FORBIDDEN);
    const { newPassword } = body;
    if (!newPassword || newPassword.length < 6) throw new HttpException('Passwort muss mindestens 6 Zeichen lang sein', HttpStatus.BAD_REQUEST);
    return this.usersService.resetPassword(id, newPassword);
  }

  @Get(':id/auslastung')
  @UseGuards(JwtAuthGuard)
  async getAuslastung(@Param('id') id: string, @Request() req: any, @Query('year') year?: string) {
    // Only the user themselves or management may view utilization.
    if (id !== (req.user?.userId || req.user?.id) && !isManager(req.user?.role)) {
      throw new ForbiddenException('Zugriff verweigert');
    }
    return this.usersService.getAuslastung(id, year ? parseInt(year) : undefined);
  }

  @Post('me')
  @UseGuards(JwtAuthGuard)
  async me(@Request() req: any): Promise<any> {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) return { error: 'User not authenticated' };
    const user = await this.usersService.findById(userId);
    if (!user) return { error: 'User not found' };
    return user;
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Body() body: any, @Request() req: any): Promise<any> {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) throw new HttpException('Not authenticated', HttpStatus.UNAUTHORIZED);
    return this.usersService.updateProfile(userId, { name: body.name, email: body.email });
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(@Body() body: any, @Request() req: any): Promise<any> {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) throw new HttpException('Not authenticated', HttpStatus.UNAUTHORIZED);
    const { oldPassword, newPassword } = body;
    if (!oldPassword || !newPassword) throw new HttpException('Fehlende Felder', HttpStatus.BAD_REQUEST);
    try {
      return await this.usersService.changePassword(userId, oldPassword, newPassword);
    } catch (e: any) {
      throw new HttpException(e.message || 'Fehler', HttpStatus.BAD_REQUEST);
    }
  }
}
