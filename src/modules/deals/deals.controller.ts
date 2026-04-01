
import { Controller, Get, Post, Patch, Delete, Param, Request, Body, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DealsService } from './deals.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ChangeDealStageDto } from './dto/change-stage.dto';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { CreateAttachmentDto } from './dto/create-attachment.dto';

@Controller('deals')
@UseGuards(JwtAuthGuard)
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Get('/analytics')
  async getAnalytics() {
    return this.dealsService.getAnalytics();
  }

  @Get('/insights')
  async getDealInsights() {
    return this.dealsService.getDealInsights();
  }

  // Notes / Kommentare
  @Post(':id/notes')
  async addNote(@Param('id') id: string, @Body() dto: CreateNoteDto, @Request() req: any) {
    return this.dealsService.addNote(id, dto.content, req.user);
  }

  @Get(':id/notes')
  async getNotes(@Param('id') id: string) {
    return this.dealsService.getNotes(id);
  }

  // Attachments (URL-based legacy)
  @Post(':id/attachments')
  async addAttachment(@Param('id') id: string, @Body() dto: CreateAttachmentDto, @Request() req: any) {
    return this.dealsService.addAttachment(id, dto.url, dto.filename, req.user);
  }

  // File upload
  @Post(':id/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    return this.dealsService.uploadAttachment(id, file, req.user);
  }

  @Get(':id/attachments')
  async getAttachments(@Param('id') id: string) {
    return this.dealsService.getAttachments(id);
  }

  @Delete('attachments/:attachmentId')
  async deleteAttachment(@Param('attachmentId') attachmentId: string, @Request() req: any) {
    return this.dealsService.deleteAttachment(attachmentId, req.user);
  }

  @Post(':id/change-stage')
  async changeStage(
    @Param('id') id: string,
    @Body() dto: ChangeDealStageDto,
    @Request() req: any,
  ) {
    return this.dealsService.changeStage(id, dto, req.user);
  }

  @Post()
  async create(@Body() dto: CreateDealDto, @Request() req: any) {
    return this.dealsService.create(dto, req.user);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateDealDto, @Request() req: any) {
    return this.dealsService.update(id, dto, req.user);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.dealsService.delete(id, req.user);
  }

  @Get('/deal-stages')
  async getDealStages() {
    return this.dealsService.getDealStages();
  }

  @Get()
  async findAll(@Request() req: any): Promise<any[]> {
    try {
      const result = await this.dealsService.findAll(req.user);
      return Array.isArray(result) ? result : [];
    } catch (e) {
      return [];
    }
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: any): Promise<any> {
    return this.dealsService.findById(id, req.user);
  }
}
