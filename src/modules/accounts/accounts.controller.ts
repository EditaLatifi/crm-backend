
import { Controller, Get, Post, Body, Param, UseGuards, Request, Query, Delete, Patch } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PaginationDto } from '../../common/pagination/pagination.dto';
import { forbidden } from '../../common/error/error.response';
import { canAccessAccount } from '../../common/policies/account.policy';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}
  @Get()
  async findAll(@Query() query: PaginationDto) {
    const { page = 1, pageSize = 20 } = query;
    // For demo: fetch all accounts without user restrictions
    return this.accountsService.findAll(null, page, pageSize);
  }

  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.accountsService.create(body, req.user);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: any) {
    return this.accountsService.findById(id, req.user);
  }


  @Post(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.accountsService.update(id, body, req.user);
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
