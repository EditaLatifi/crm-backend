import { Controller, Get, UseGuards, Request, Query } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Request() req: any, @Query('limit') limit?: string): Promise<any[]> {
    return this.activityService.findAll(req.user, limit ? parseInt(limit) : 50);
  }
}
