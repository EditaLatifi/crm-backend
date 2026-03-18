import { Controller, Get, Post, Patch, Delete, Param, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermitsService } from './permits.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class PermitsController {
  constructor(private service: PermitsService) {}

  @Get('permits/stats')
  stats() { return this.service.getStats(); }

  @Get('permits')
  findAll(@Request() req: any) { return this.service.findAll(req.user); }

  @Get('projects/:projectId/permits')
  findByProject(@Param('projectId') projectId: string, @Request() req: any) {
    return this.service.findByProject(projectId, req.user);
  }

  @Post('projects/:projectId/permits')
  create(@Param('projectId') projectId: string, @Body() dto: any, @Request() req: any) {
    return this.service.create(projectId, dto, req.user);
  }

  @Patch('permits/:id')
  update(@Param('id') id: string, @Body() dto: any, @Request() req: any) {
    return this.service.update(id, dto, req.user);
  }

  @Delete('permits/:id')
  delete(@Param('id') id: string, @Request() req: any) {
    return this.service.delete(id, req.user);
  }
}
