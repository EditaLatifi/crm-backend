import {
  Controller, Get, Post, Patch, Delete, Param, Body,
  Request, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { DocumentsService } from './documents.service';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/documents')
export class DocumentsController {
  constructor(private service: DocumentsService) {}

  @Get()
  findAll(@Param('projectId') projectId: string, @Request() req: any) {
    return this.service.findByProject(projectId, req.user);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  upload(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: any,
    @Request() req: any,
  ) {
    return this.service.uploadFile(projectId, file, dto, req.user);
  }

  @Post()
  create(@Param('projectId') projectId: string, @Body() dto: any, @Request() req: any) {
    return this.service.create(projectId, dto, req.user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Request() req: any) {
    return this.service.delete(id, req.user);
  }
}
