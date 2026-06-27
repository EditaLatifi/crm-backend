
import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { TimeTrackingService } from './time-tracking.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PaginationDto } from '../../common/pagination/pagination.dto';

@Controller('time-entries')
export class TimeTrackingController {
  constructor(private readonly timeTrackingService: TimeTrackingService) {}

  @UseGuards(JwtAuthGuard)
  @Post('/timer/start')
  async startTimer(@Request() req: any, @Body() body: { accountId: string; taskId?: string; description?: string; projectId?: string; projectPhaseId?: string; isBillableExtra?: boolean }) {
    return this.timeTrackingService.startTimer(req.user, body.accountId, body.taskId, body.description, body.projectId, body.projectPhaseId, body.isBillableExtra);
  }

  @UseGuards(JwtAuthGuard)
  @Get('/timer/status')
  async getTimerStatus(@Request() req: any) {
    return this.timeTrackingService.getTimerStatus(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('/timer/stop')
  async stopTimer(@Request() req: any, @Body() body: { overBudgetReason?: string } = {}) {
    const user = req.user;
    return this.timeTrackingService.stopTimer(user, body?.overBudgetReason);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('/timer')
  async discardTimer(@Request() req: any) {
    return this.timeTrackingService.discardTimer(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async manualEntry(@Request() req: any, @Body() body: any) {
    return this.timeTrackingService.manualEntry(req.user, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('/overview')
  async getOverview(
    @Request() req: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
  ) {
    return this.timeTrackingService.getOverview(req.user, { from, to, userId });
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(
    @Request() req: any,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.timeTrackingService.findAll(req.user, { userId, from, to, accountId, projectId });
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: any): Promise<any> {
    return this.timeTrackingService.findById(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async updateEntry(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.timeTrackingService.updateEntry(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteEntry(@Param('id') id: string, @Request() req: any) {
    return this.timeTrackingService.deleteEntry(id, req.user);
  }
}
