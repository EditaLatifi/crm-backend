import { Controller, Get, Param, UseGuards, Request, Delete, Body, Post, Patch, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/role.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '@prisma/client';
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  async findAll(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ): Promise<any> {
    return this.contactsService.findAll(
      req.user,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 50,
      search,
    );
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: any): Promise<any> {
    return this.contactsService.findById(id, req.user);
  }

  // Bulk delete contacts (admin only)
  @Delete('bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async bulkDelete(@Body('ids') ids: string[], @Request() req: any): Promise<{ deleted: number }> {
    return this.contactsService.bulkDelete(ids, req.user);
  }

  // Delete a single contact
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async deleteContact(@Param('id') id: string, @Request() req: any): Promise<{ deleted: boolean }> {
    await this.contactsService.deleteContact(id, req.user);
    return { deleted: true };
  }

  // Update a contact
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any): Promise<any> {
    return this.contactsService.updateContact(id, body, req.user);
  }

  // Create a new contact
  @Post()
  async create(@Body() body: any, @Request() req: any): Promise<any> {
    return this.contactsService.createContact(body, req.user);
  }
}
