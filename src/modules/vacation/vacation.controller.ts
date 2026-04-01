import { Controller, Get, Post, Delete, Patch, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { VacationService } from './vacation.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

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
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  /** Admin: stats with quota/remaining */
  @Get('stats')
  stats(@Query('year') year: string) {
    return this.service.stats(parseInt(year) || new Date().getFullYear());
  }

  /** Admin: get all quotas for a year */
  @Get('quotas')
  getQuotas(@Query('year') year: string) {
    return this.service.getQuotas(parseInt(year) || new Date().getFullYear());
  }

  /** Admin: set quota for a user */
  @Patch('quotas/:userId')
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
