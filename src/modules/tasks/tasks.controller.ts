
import { Controller, Get, Param, Patch, Delete, Body, Request, Post, UseGuards, Query, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async createTask(@Body() body: any, @Request() req: any) {
    return this.tasksService.createTask(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async updateTask(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.tasksService.updateTask(id, body, req.user);
  }
  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body('status') status: string, @Request() req: any) {
    return this.tasksService.updateStatus(id, status, req.user);
  }

  @UseGuards(JwtAuthGuard)
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

  @UseGuards(JwtAuthGuard)
  @Post(':id/time-entries')
  async addTimeEntry(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.tasksService.addTimeEntry(id, body, req.user);
  }

  // ─── Task Documents ───
  @Get(':id/documents')
  async getDocuments(@Param('id') id: string) {
    return this.tasksService.getDocuments(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/documents/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category: string,
    @Request() req: any,
  ) {
    return this.tasksService.uploadDocument(id, file, category, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('documents/:docId')
  async deleteDocument(@Param('docId') docId: string, @Request() req: any) {
    return this.tasksService.deleteDocument(docId, req.user);
  }

  @Get()
  async findAll(
    @Request() req: any,
    @Query('assignedToMe') assignedToMe?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ): Promise<any> {
    return this.tasksService.findAll(
      req.user,
      assignedToMe === 'true',
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 50,
      search,
    );
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: any): Promise<any> {
    return this.tasksService.findByIdWithDetails(id, req.user);
  }
}
