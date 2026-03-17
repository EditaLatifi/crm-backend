import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { EmailLogsService } from './email-logs.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('email-logs')
@UseGuards(JwtAuthGuard)
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
