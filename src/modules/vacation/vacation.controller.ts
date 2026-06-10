import { Controller, Get, Post, Delete, Patch, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { Role } from '@prisma/client';
import { VacationService } from './vacation.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/role.decorator';

@Controller('vacation')
@UseGuards(JwtAuthGuard)
export class VacationController {
  constructor(private service: VacationService) {}

  /** Employee: get own requests */
  @Get('mine')
  findMine(@Request() req: any) {
    return this.service.findMine(req.user);
  }

  /** Employee: get own stats (used/quota/remaining) */
  @Get('my-stats')
  myStats(@Request() req: any) {
    return this.service.myStats(req.user);
  }

  /** Admin: get all requests */
  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  /** Admin: stats with quota/remaining */
  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  stats(@Query('year') year: string) {
    return this.service.stats(parseInt(year) || new Date().getFullYear());
  }

  /** Admin: per-user vacation stats (total/used/remaining) for all users */
  @Get('all-stats')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  allStats(@Query('year') year?: string) {
    return this.service.allStats(year ? parseInt(year) : undefined);
  }

  /** Admin: get all quotas for a year */
  @Get('quotas')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  getQuotas(@Query('year') year: string) {
    return this.service.getQuotas(parseInt(year) || new Date().getFullYear());
  }

  /** Admin: set quota for a user */
  @Patch('quotas/:userId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  setQuota(
    @Param('userId') userId: string,
    @Body() body: { year: number; days: number },
  ) {
    return this.service.setQuota(userId, body.year, body.days);
  }

  /** Create request */
  @Post()
  create(@Body() body: any, @Request() req: any) {
    return this.service.create(body, req.user);
  }

  /** Admin: approve or reject */
  @Patch(':id/review')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  review(
    @Param('id') id: string,
    @Body() body: { action: 'APPROVED' | 'REJECTED'; adminNote?: string },
    @Request() req: any,
  ) {
    return this.service.review(id, body.action, body.adminNote, req.user);
  }

  /** Employee: cancel own pending */
  @Delete(':id')
  cancel(@Param('id') id: string, @Request() req: any) {
    return this.service.cancel(id, req.user);
  }
}
