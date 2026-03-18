import { Controller, Get, Post, Delete, Param, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ShareService } from './share.service';

@Controller()
export class ShareController {
  constructor(private service: ShareService) {}

  // Public endpoint — no auth required
  @Get('share/:token')
  publicView(@Param('token') token: string) {
    return this.service.getPublicView(token);
  }

  @UseGuards(JwtAuthGuard)
  @Get('projects/:projectId/shares')
  list(@Param('projectId') projectId: string, @Request() req: any) {
    return this.service.getSharesByProject(projectId, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('projects/:projectId/shares')
  create(@Param('projectId') projectId: string, @Body() dto: any, @Request() req: any) {
    return this.service.createShare(projectId, dto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('shares/:id')
  delete(@Param('id') id: string, @Request() req: any) {
    return this.service.deleteShare(id, req.user);
  }
}
