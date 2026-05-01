import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Request, UseGuards,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/role.decorator';
import { Role } from '@prisma/client';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdatePhaseDto } from './dto/update-phase.dto';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async getStats() {
    return this.projectsService.getStats();
  }

  @Get('budget-overview')
  async getBudgetOverview(@Request() req: any) {
    return this.projectsService.getBudgetOverview(req.user);
  }

  @Get('templates')
  async listTemplates() {
    return this.projectsService.listTemplates();
  }

  @Post('templates')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async createTemplate(@Body() body: any) {
    return this.projectsService.createTemplate(body);
  }

  @Get('templates/:tplId')
  async getTemplate(@Param('tplId') tplId: string) {
    return this.projectsService.getTemplate(tplId);
  }

  @Patch('templates/:tplId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async updateTemplate(@Param('tplId') tplId: string, @Body() body: any) {
    return this.projectsService.updateTemplate(tplId, body);
  }

  @Delete('templates/:tplId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async deleteTemplate(@Param('tplId') tplId: string) {
    return this.projectsService.deleteTemplate(tplId);
  }

  @Get()
  async findAll(@Request() req: any) {
    return this.projectsService.findAll(req.user);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: any) {
    return this.projectsService.findById(id, req.user);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async create(@Body() dto: CreateProjectDto, @Request() req: any) {
    return this.projectsService.create(dto, req.user);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateProjectDto, @Request() req: any) {
    return this.projectsService.update(id, dto, req.user);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.projectsService.delete(id, req.user);
  }

  @Post(':id/phases')
  async createPhase(
    @Param('id') id: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.projectsService.createPhase(id, body, req.user);
  }

  @Patch(':id/phases/:phaseId')
  async updatePhase(
    @Param('id') id: string,
    @Param('phaseId') phaseId: string,
    @Body() dto: UpdatePhaseDto,
    @Request() req: any,
  ) {
    return this.projectsService.updatePhase(id, phaseId, dto, req.user);
  }

  @Delete(':id/phases/:phaseId')
  async deletePhase(
    @Param('id') id: string,
    @Param('phaseId') phaseId: string,
    @Request() req: any,
    @Body() body?: { linkedTaskAction?: 'delete' | 'keep' },
  ) {
    return this.projectsService.deletePhase(id, phaseId, req.user, body?.linkedTaskAction);
  }

  // ─── Construction Milestones (master list, admin-managed) ───
  @Get('milestones/master')
  async listMilestoneMaster() {
    return this.projectsService.listMilestoneMaster();
  }

  @Post('milestones/master')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async createMilestoneMaster(@Body() body: any) {
    return this.projectsService.createMilestoneMaster(body);
  }

  @Patch('milestones/master/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async updateMilestoneMaster(@Param('id') id: string, @Body() body: any) {
    return this.projectsService.updateMilestoneMaster(id, body);
  }

  @Delete('milestones/master/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async deleteMilestoneMaster(@Param('id') id: string) {
    return this.projectsService.deleteMilestoneMaster(id);
  }

  // ─── Per-project milestones (Bauforschritt timeline) ───
  @Get(':id/milestones')
  async listProjectMilestones(@Param('id') id: string, @Request() req: any) {
    return this.projectsService.listProjectMilestones(id, req.user);
  }

  @Post(':id/milestones')
  async setProjectMilestones(
    @Param('id') id: string,
    @Body() body: { milestoneIds: string[] },
    @Request() req: any,
  ) {
    return this.projectsService.setProjectMilestones(id, body.milestoneIds, req.user);
  }

  @Patch(':id/milestones/:milestoneRowId')
  async toggleProjectMilestone(
    @Param('id') id: string,
    @Param('milestoneRowId') milestoneRowId: string,
    @Body() body: { completed: boolean; comment?: string },
    @Request() req: any,
  ) {
    return this.projectsService.toggleProjectMilestone(id, milestoneRowId, body.completed, req.user, body.comment);
  }

  @Post(':id/members')
  async addMember(
    @Param('id') id: string,
    @Body() body: { userId: string; role?: string },
    @Request() req: any,
  ) {
    return this.projectsService.addMember(id, body.userId, body.role, req.user);
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    return this.projectsService.removeMember(id, userId, req.user);
  }
}
