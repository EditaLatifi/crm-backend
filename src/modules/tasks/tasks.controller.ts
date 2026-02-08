
import { Controller, Get, Param, Patch, Body, Request, Post, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  async createTask(@Body() body: any, @Request() req: any) {
    return this.tasksService.createTask(body, req.user);
  }
  @Patch(':id')
  async updateTask(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.tasksService.updateTask(id, body, req.user);
  }
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body('status') status: string, @Request() req: any) {
    return this.tasksService.updateStatus(id, status, req.user);
  }

  @Patch(':id/priority')
  async updatePriority(@Param('id') id: string, @Body('priority') priority: string, @Request() req: any) {
    return this.tasksService.updatePriority(id, priority, req.user);
  }

  @Get(':id/comments')
  async getComments(@Param('id') id: string) {
    return this.tasksService.getComments(id);
  }

 @UseGuards(JwtAuthGuard)
@Post(':id/comments')
async addComment(
  @Param('id') id: string,
  @Body('text') text: string,
  @Request() req: any,
) {
  console.log('addComment req.user:', req.user);
  return this.tasksService.addComment(id, text, req.user);
}


  @Get(':id/history')
  async getHistory(@Param('id') id: string) {
    return this.tasksService.getHistory(id);
  }

  @Get(':id/time-entries')
  async getTimeEntries(@Param('id') id: string) {
    return this.tasksService.getTimeEntries(id);
  }

  // Disable authentication for this endpoint
  @Post(':id/time-entries')
  @UseGuards() // disables any global guards for this route
  async addTimeEntry(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    // Pass null as user to service to indicate unauthenticated
    return this.tasksService.addTimeEntry(id, body, null);
  }

  @Get()
  async findAll(@Request() req: any): Promise<any[]> {
    return this.tasksService.findAll(req.user);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: any): Promise<any> {
    return this.tasksService.findByIdWithDetails(id, req.user);
  }
}
