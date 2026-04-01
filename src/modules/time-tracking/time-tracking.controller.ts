
import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { TimeTrackingService } from './time-tracking.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PaginationDto } from '../../common/pagination/pagination.dto';

@Controller('time-entries')
export class TimeTrackingController {
  constructor(private readonly timeTrackingService: TimeTrackingService) {}

  @UseGuards(JwtAuthGuard)
  @Post('/timer/start')
  async startTimer(@Request() req: any, @Body() body: { accountId: string; taskId?: string; description?: string }) {
    return this.timeTrackingService.startTimer(req.user, body.accountId, body.taskId, body.description);
  }

  @UseGuards(JwtAuthGuard)
  @Get('/timer/status')
  async getTimerStatus(@Request() req: any) {
    return this.timeTrackingService.getTimerStatus(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('/timer/stop')
  async stopTimer(@Request() req: any) {
    const user = req.user;
    return this.timeTrackingService.stopTimer(user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('/timer')
  async discardTimer(@Request() req: any) {
    return this.timeTrackingService.discardTimer(req.user);
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
}
