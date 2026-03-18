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

  @Patch(':id/phases/:phaseId')
  async updatePhase(
    @Param('id') id: string,
    @Param('phaseId') phaseId: string,
    @Body() dto: UpdatePhaseDto,
    @Request() req: any,
  ) {
    return this.projectsService.updatePhase(id, phaseId, dto, req.user);
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
