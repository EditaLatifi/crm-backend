import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AppointmentsService } from './appointments.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/role.decorator';

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.PROJEKTLEITER, Role.MITARBEITER, Role.USER)
export class AppointmentsController {
  constructor(private service: AppointmentsService) {}

  @Get()
  findAll(@Request() req: any, @Query('upcoming') upcoming?: string) {
    return this.service.findAll(req.user, upcoming === 'true');
  }

  @Get(':id')
  findById(@Param('id') id: string, @Request() req: any) {
    return this.service.findById(id, req.user);
  }

  @Post()
  create(@Body() body: any, @Request() req: any) {
    return this.service.create(body, req.user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.service.update(id, body, req.user);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Request() req: any) {
    return this.service.delete(id, req.user);
  }
}
