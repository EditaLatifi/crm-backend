
import { Controller, Get, Post, Body, Param, UseGuards, Request, Query, Delete, Patch } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PaginationDto } from '../../common/pagination/pagination.dto';

@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  async findAll(@Query() query: any, @Request() req: any) {
    const { page = 1, pageSize = 20, type } = query;
    return this.accountsService.findAll(req.user, page, pageSize, type);
  }

  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.accountsService.create(body, req.user);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: any) {
    return this.accountsService.findById(id, req.user);
  }

  @Patch(':id')
  async patchUpdate(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.accountsService.update(id, body, req.user);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.accountsService.delete(id, req.user);
  }

  // ─── Account Notes (threaded) ───
  @Get(':id/notes')
  async getNotes(@Param('id') id: string) {
    return this.accountsService.getNotes(id);
  }

  @Post(':id/notes')
  async addNote(@Param('id') id: string, @Body('content') content: string, @Request() req: any) {
    return this.accountsService.addNote(id, content, req.user);
  }

  @Delete('notes/:noteId')
  async deleteNote(@Param('noteId') noteId: string) {
    return this.accountsService.deleteNote(noteId);
  }

  // ─── Bulk Operations ───
  @Post('bulk-assign')
  async bulkAssign(@Body() body: { ids: string[]; ownerUserId: string }, @Request() req: any) {
    return this.accountsService.bulkAssign(body.ids, body.ownerUserId, req.user);
  }

  @Post('bulk-type')
  async bulkChangeType(@Body() body: { ids: string[]; type: string }, @Request() req: any) {
    return this.accountsService.bulkChangeType(body.ids, body.type, req.user);
  }
}
