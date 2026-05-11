import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { FollowUpsService } from './follow-ups.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('follow-ups')
@UseGuards(JwtAuthGuard)
export class FollowUpsController {
  constructor(private service: FollowUpsService) {}

  @Get()
  findAll(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('assignedToUserId') assignedToUserId?: string,
    @Query('completed') completed?: string,
    @Query('dueBefore') dueBefore?: string,
    @Query('dueAfter') dueAfter?: string,
  ) {
    return this.service.findAll({
      entityType,
      entityId,
      assignedToUserId,
      completed: completed !== undefined ? completed === 'true' : undefined,
      dueBefore,
      dueAfter,
    });
  }

  @Get('upcoming')
  getUpcoming(@Request() req: any, @Query('days') days?: string) {
    return this.service.getUpcoming(req.user.userId, days ? parseInt(days, 10) : 7);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() body: any, @Request() req: any) {
    return this.service.create({
      ...body,
      createdByUserId: req.user.userId,
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
