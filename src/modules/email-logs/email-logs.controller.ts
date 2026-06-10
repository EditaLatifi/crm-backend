import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { Role } from '@prisma/client';
import { EmailLogsService } from './email-logs.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/role.decorator';

@Controller('email-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.PROJEKTLEITER, Role.MITARBEITER, Role.USER)
export class EmailLogsController {
  constructor(private service: EmailLogsService) {}

  @Get()
  findForEntity(@Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    const type = entityType === 'contact' ? 'contact' : 'account';
    return this.service.findForEntity(type, entityId);
  }

  @Post()
  create(@Body() body: any, @Request() req: any) {
    return this.service.create(body, req.user);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
