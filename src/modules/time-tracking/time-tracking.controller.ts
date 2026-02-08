
import { Controller, Get, Post, Param, UseGuards, Request, Query } from '@nestjs/common';
import { TimeTrackingService } from './time-tracking.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PaginationDto } from '../../common/pagination/pagination.dto';
import { forbidden } from '../../common/error/error.response';
import { canAccessTimeEntry } from '../../common/policies/time-entry.policy';

@Controller('time-entries')
export class TimeTrackingController {
  constructor(private readonly timeTrackingService: TimeTrackingService) {}

  @UseGuards(JwtAuthGuard)
  @Post('/timer/stop')
  async stopTimer(@Request() req: any) {
    const user = req.user;
    return this.timeTrackingService.stopTimer(user);
  }

  // Allow unauthenticated access for admin report
  @Get()
  async findAll(@Request() req: any, @Query() query: PaginationDto) {
    // For unauthenticated, return all entries (for admin report)
    const { page = 1, pageSize = 1000 } = query;
    return this.timeTrackingService.findAll(null, page, pageSize);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: any): Promise<any> {
    return this.timeTrackingService.findById(id, req.user);
  }
}
