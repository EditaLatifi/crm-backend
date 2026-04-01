import { Controller, Get, Post, Patch, Delete, Param, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { VendorsService } from './vendors.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class VendorsController {
  constructor(private service: VendorsService) {}

  @Get('vendors/stats')
  stats() { return this.service.getStats(); }

  @Get('vendors')
  findAll(@Request() req: any) { return this.service.findAll(req.user); }

  @Get('vendors/:id')
  findById(@Param('id') id: string) { return this.service.findById(id); }

  @Get('projects/:projectId/vendors')
  findByProject(@Param('projectId') projectId: string, @Request() req: any) {
    return this.service.findByProject(projectId, req.user);
  }

  @Post('vendors')
  create(@Body() dto: any, @Request() req: any) {
    return this.service.create(dto, req.user);
  }

  @Patch('vendors/:id')
  update(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.service.update(id, dto, req.user);
  }

  @Delete('vendors/:id')
  delete(@Param('id') id: string, @Request() req: any) {
    return this.service.delete(id, req.user);
  }

  @Post('projects/:projectId/vendors/:vendorId')
  assign(@Param('projectId') projectId: string, @Param('vendorId') vendorId: string, @Body() dto: any, @Request() req: any) {
    return this.service.assignToProject(projectId, vendorId, dto, req.user);
  }

  @Delete('projects/:projectId/vendors/:vendorId')
  removeFromProject(@Param('projectId') projectId: string, @Param('vendorId') vendorId: string, @Request() req: any) {
    return this.service.removeFromProject(projectId, vendorId, req.user);
  }

  @Get('projects/:projectId/suppliers')
  findSuppliers(@Param('projectId') projectId: string, @Request() req: any) {
    return this.service.findSuppliersByProject(projectId, req.user);
  }

  @Post('projects/:projectId/suppliers/:accountId')
  assignSupplier(@Param('projectId') projectId: string, @Param('accountId') accountId: string, @Body() dto: any, @Request() req: any) {
    return this.service.assignSupplierToProject(projectId, accountId, dto, req.user);
  }

  @Delete('projects/:projectId/suppliers/:accountId')
  removeSupplier(@Param('projectId') projectId: string, @Param('accountId') accountId: string, @Request() req: any) {
    return this.service.removeSupplierFromProject(projectId, accountId, req.user);
  }
}
