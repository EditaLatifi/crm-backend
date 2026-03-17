
import { RunningTimer, TimeEntry, Role } from '@prisma/client';
import { Injectable, BadRequestException } from '@nestjs/common';
import { forbidden, notFound } from '../../common/error/error.response';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class TimeTrackingService {
  constructor(private prisma: PrismaService) {}

  async startTimer(user: any, accountId: string, taskId?: string, description?: string): Promise<RunningTimer> {
    const existing = await this.prisma.runningTimer.findUnique({ where: { userId: user.userId } });
    if (existing) throw new BadRequestException('Ein Timer läuft bereits. Stoppe ihn zuerst.');
    return this.prisma.runningTimer.create({
      data: {
        userId: user.userId,
        accountId,
        taskId: taskId || null,
        description: description || null,
        startedAt: new Date(),
      },
      include: { account: true, task: true },
    });
  }

  async getTimerStatus(user: any): Promise<{ running: boolean; elapsedSeconds?: number; startedAt?: Date; accountId?: string; taskId?: string | null; description?: string | null; accountName?: string; taskTitle?: string | null }> {
    const runningTimer = await this.prisma.runningTimer.findUnique({
      where: { userId: user.userId },
      include: { account: true, task: true },
    });
    if (!runningTimer) return { running: false };
    const elapsedSeconds = Math.floor((Date.now() - new Date(runningTimer.startedAt).getTime()) / 1000);
    return {
      running: true,
      startedAt: runningTimer.startedAt,
      elapsedSeconds,
      accountId: runningTimer.accountId,
      taskId: runningTimer.taskId,
      description: runningTimer.description,
      accountName: (runningTimer as any).account?.name,
      taskTitle: (runningTimer as any).task?.title,
    };
  }

  async stopTimer(user: any): Promise<{ timeEntry: TimeEntry }> {
    // 1. Read running timer
    const runningTimer = await this.prisma.runningTimer.findUnique({ where: { userId: user.userId } });
    if (!runningTimer) throw forbidden('No running timer found');

    // 2. Calculate duration
    const endedAt = new Date();
    const startedAt = runningTimer.startedAt;
    const durationMinutes = Math.max(1, Math.floor((endedAt.getTime() - startedAt.getTime()) / 60000));

    // 3. Atomic transaction: delete running timer, create time entry, log activity
    const [_, timeEntry, __] = await this.prisma.$transaction([
      this.prisma.runningTimer.delete({ where: { userId: user.userId } }),
      this.prisma.timeEntry.create({
        data: {
          userId: user.userId,
          accountId: runningTimer.accountId,
          taskId: runningTimer.taskId,
          startedAt,
          endedAt,
          durationMinutes,
          description: runningTimer.description || undefined,
        },
      }),
      this.prisma.activity.create({
        data: {
          actorUserId: user.userId,
          entityType: 'TimeEntry',
          entityId: runningTimer.id,
          action: 'timer_stop',
          payloadJson: {
            startedAt,
            endedAt,
            durationMinutes,
            accountId: runningTimer.accountId,
            taskId: runningTimer.taskId,
          },
        },
      }),
    ]);
    return { timeEntry };
  }

  async discardTimer(user: any): Promise<{ discarded: boolean }> {
    const runningTimer = await this.prisma.runningTimer.findUnique({ where: { userId: user.userId } });
    if (!runningTimer) return { discarded: false };
    await this.prisma.runningTimer.delete({ where: { userId: user.userId } });
    return { discarded: true };
  }

  async findAll(user: any, page = 1, pageSize = 20): Promise<TimeEntry[]> {
    const include = { user: true, account: true, task: true };
    let result;
    if (!user || !user.role) {
      result = await this.prisma.timeEntry.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        include,
      });
      return result;
    }
    if (user.role === Role.ADMIN) {
      result = await this.prisma.timeEntry.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        include,
      });
      return result;
    }
    result = await this.prisma.timeEntry.findMany({
      where: { userId: user.userId },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include,
    });
    return result;
  }

  async findById(id: string, user: any): Promise<TimeEntry> {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id },
      include: { user: true, account: true, task: true },
    });
    if (!entry) throw notFound('Time entry not found');
    if (!user || !user.role) {
      return entry;
    }
    if (user.role !== Role.ADMIN && entry.userId !== user.userId) {
      throw forbidden('Access denied');
    }
    return entry;
  }
}
