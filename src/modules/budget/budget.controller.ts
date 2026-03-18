import { Controller, Get, Post, Patch, Delete, Param, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { BudgetService } from './budget.service';

@UseGuards(JwtAuthGuard)
@Controller('budget')
export class BudgetAlertsController {
  constructor(private service: BudgetService) {}

  @Get('alerts')
  getAlerts(@Request() req: any) {
    return this.service.getAlerts(req.user);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/budget')
export class BudgetController {
  constructor(private service: BudgetService) {}

  @Get()
  findAll(@Param('projectId') projectId: string, @Request() req: any) {
    return this.service.findByProject(projectId, req.user);
  }

  @Get('summary')
  summary(@Param('projectId') projectId: string, @Request() req: any) {
    return this.service.getSummary(projectId, req.user);
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
