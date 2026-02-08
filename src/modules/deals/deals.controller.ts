
import { Controller, Get, Post, Patch, Delete, Param, Request, Body } from '@nestjs/common';
import { DealsService } from './deals.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ChangeDealStageDto } from './dto/change-stage.dto';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { CreateAttachmentDto } from './dto/create-attachment.dto';

@Controller('deals')
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Get('/analytics')
  async getAnalytics() {
    return this.dealsService.getAnalytics();
  }

  // Notes
  @Post(':id/notes')
  async addNote(@Param('id') id: string, @Body() dto: CreateNoteDto, @Request() req: any) {
    return this.dealsService.addNote(id, dto.content, req.user);
  }

  @Get(':id/notes')
  async getNotes(@Param('id') id: string) {
    return this.dealsService.getNotes(id);
  }

  // Attachments
  @Post(':id/attachments')
  async addAttachment(@Param('id') id: string, @Body() dto: CreateAttachmentDto, @Request() req: any) {
    return this.dealsService.addAttachment(id, dto.url, dto.filename, req.user);
  }

  @Get(':id/attachments')
  async getAttachments(@Param('id') id: string) {
    return this.dealsService.getAttachments(id);
  }

  @Post(':id/change-stage')
  async changeStage(
    @Param('id') id: string,
    @Body() dto: ChangeDealStageDto,
    @Request() req: any,
  ) {
    return this.dealsService.changeStage(id, dto, req.user);
  }

  // No auth guard for local/dev: allow anyone to create a deal
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

  // GET /deal-stages: List all deal stages for board columns
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
      console.error('DealsController.findAll error:', e);
      return [];
    }
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: any): Promise<any> {
    return this.dealsService.findById(id, req.user);
  }
}
