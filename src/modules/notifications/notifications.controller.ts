import {
  Controller, Get, Patch, Delete, Param, Req, Res, Body, UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly gateway: NotificationsGateway,
  ) {}

  /** SSE stream — keeps connection open and pushes events in real time */
  @Get('stream')
  @SkipThrottle()
  async stream(@Req() req: Request, @Res() res: Response) {
    const user = (req as any).user;
    const userId = user?.userId || user?.sub;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial unread count
    const { count } = await this.notificationsService.getUnreadCount(userId);
    res.write(`data: ${JSON.stringify({ event: 'connected', unreadCount: count })}\n\n`);

    this.gateway.addStream(userId, res);

    // Keep-alive ping every 25s to prevent proxy timeouts
    const keepAlive = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { clearInterval(keepAlive); }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      this.gateway.removeStream(userId, res);
    });
  }

  @Get()
  findAll(@Req() req: Request) {
    const userId = (req as any).user?.userId;
    return this.notificationsService.findAll(userId);
  }

  @Get('unread-count')
  getUnreadCount(@Req() req: Request) {
    const userId = (req as any).user?.userId;
    return this.notificationsService.getUnreadCount(userId);
  }

  @Patch('read-all')
  markAllRead(@Req() req: Request) {
    const userId = (req as any).user?.userId;
    return this.notificationsService.markAllRead(userId);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @Req() req: Request) {
    const userId = (req as any).user?.userId;
    return this.notificationsService.markRead(id, userId);
  }

  @Delete(':id')
  deleteOne(@Param('id') id: string, @Req() req: Request) {
    const userId = (req as any).user?.userId;
    return this.notificationsService.deleteOne(id, userId);
  }

  /** Get notification preferences for current user */
  @Get('preferences')
  getPreferences(@Req() req: Request) {
    const userId = (req as any).user?.userId;
    return this.notificationsService.getPreferences(userId);
  }

  /** Update notification preferences for current user */
  @Patch('preferences')
  updatePreferences(@Req() req: Request, @Body() body: any) {
    const userId = (req as any).user?.userId;
    return this.notificationsService.updatePreferences(userId, body);
  }
}
