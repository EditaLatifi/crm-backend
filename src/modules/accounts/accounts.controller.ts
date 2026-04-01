
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
}
