
import { Controller, Get, Post, Put, Patch, Delete, Param, Request, Body, UseGuards, UseInterceptors, UploadedFile, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DealsService } from './deals.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ChangeDealStageDto } from './dto/change-stage.dto';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { CreateNoteDto } from './dto/create-note.dto';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { CreatePhasePaymentDto } from './dto/create-phase-payment.dto';
import { UpdatePhasePaymentDto } from './dto/update-phase-payment.dto';

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

  // ─── Deal Contacts ───
  @Get(':id/contacts')
  async listDealContacts(@Param('id') id: string) {
    return this.dealsService.listDealContacts(id);
  }

  @Post(':id/contacts')
  async addDealContact(@Param('id') id: string, @Body() body: { contactId: string }) {
    return this.dealsService.addDealContact(id, body.contactId);
  }

  @Delete(':id/contacts/:contactId')
  async removeDealContact(@Param('id') id: string, @Param('contactId') contactId: string) {
    return this.dealsService.removeDealContact(id, contactId);
  }

  @Post(':id/change-stage')
  async changeStage(
    @Param('id') id: string,
    @Body() dto: ChangeDealStageDto,
    @Request() req: any,
  ) {
    return this.dealsService.changeStage(id, dto, req.user);
  }

  // ─── Deal Phases ───
  @Get(':id/phases')
  async listPhases(@Param('id') id: string, @Request() req: any) {
    return this.dealsService.listPhases(id, req.user);
  }

  @Post(':id/phases')
  async createPhase(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.dealsService.createPhase(id, body, req.user);
  }

  @Put(':id/phases/budget-hours')
  @Patch(':id/phases/budget-hours')
  async bulkUpdatePhaseBudgetHours(
    @Param('id') id: string,
    @Body() body: { updates: Array<{ phaseId: string; hourBudget: number | null }> },
  ) {
    return this.dealsService.bulkUpdatePhaseBudgetHours(id, body?.updates || []);
  }

  @Patch('phases/:phaseId')
  async updatePhase(@Param('phaseId') phaseId: string, @Body() body: any) {
    return this.dealsService.updatePhase(phaseId, body);
  }

  @Delete('phases/:phaseId')
  async deletePhase(@Param('phaseId') phaseId: string) {
    return this.dealsService.deletePhase(phaseId);
  }

  @Get('sub-phase-templates')
  async listSubPhaseTemplates(@Query('parentCode') parentCode?: string) {
    return this.dealsService.listSubPhaseTemplates(parentCode);
  }

  // ─── Phase Payment Plans ───
  @Get('phases/:phaseId/payments')
  async listPayments(@Param('phaseId') phaseId: string) {
    return this.dealsService.listPayments(phaseId);
  }

  @Post('phases/:phaseId/payments')
  async createPayment(@Param('phaseId') phaseId: string, @Body() body: CreatePhasePaymentDto) {
    return this.dealsService.createPayment(phaseId, body);
  }

  @Patch('payments/:paymentId')
  async updatePayment(@Param('paymentId') paymentId: string, @Body() body: UpdatePhasePaymentDto) {
    return this.dealsService.updatePayment(paymentId, body);
  }

  @Delete('payments/:paymentId')
  async deletePayment(@Param('paymentId') paymentId: string) {
    return this.dealsService.deletePayment(paymentId);
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
  async findAll(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ): Promise<any> {
    try {
      return await this.dealsService.findAll(
        req.user,
        page ? Number(page) : 1,
        pageSize ? Number(pageSize) : 50,
        search,
      );
    } catch (e) {
      return { data: [], total: 0, page: 1, pageSize: 50 };
    }
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: any): Promise<any> {
    return this.dealsService.findById(id, req.user);
  }
}
