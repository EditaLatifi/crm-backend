import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { forbidden, notFound } from '../../common/error/error.response';
import { Deal, Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { ActivityLoggerService } from '../activity/activity-logger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SupabaseStorageService } from '../documents/supabase-storage.service';

@Injectable()
export class DealsService {
  constructor(
    private prisma: PrismaService,
    private activityLogger: ActivityLoggerService,
    private notifications: NotificationsService,
    private storage: SupabaseStorageService,
  ) {}

  // Analytics
  async getAnalytics() {
    const total = await this.prisma.deal.count();
    const won = await this.prisma.deal.count({ where: { stage: { isWon: true } } });
    const lost = await this.prisma.deal.count({ where: { stage: { isLost: true } } });
    const avgDeal = await this.prisma.deal.aggregate({ _avg: { amount: true } });
    const conversionRate = total > 0 ? Math.round((won / total) * 100) : 0;
    return {
      total,
      won,
      lost,
      winRate: total > 0 ? Math.round((won / total) * 100) : 0,
      lossRate: total > 0 ? Math.round((lost / total) * 100) : 0,
      avgDealSize: avgDeal._avg.amount || 0,
      conversionRate,
    };
  }

    // AI-powered deal insights
    async getDealInsights() {
      // Fetch deals
      const deals = await this.prisma.deal.findMany({
        select: {
          id: true,
          name: true,
          amount: true,
          stageId: true,
          createdAt: true,
          updatedAt: true,
          ownerUserId: true,
        },
      });

      // Fetch all stages for mapping
      const stages = await this.prisma.dealStage.findMany({ select: { id: true, name: true, order: true, isWon: true, isLost: true } });
      const stageMap = Object.fromEntries(stages.map(s => [s.id, s.name]));
      const stageOrderMap = Object.fromEntries(stages.map(s => [s.id, s.order]));
      const stageTypeMap = Object.fromEntries(stages.map(s => [s.id, { isWon: s.isWon, isLost: s.isLost }]));

      const now = new Date();
      const insights = deals.map(deal => {
        const daysSinceUpdate = Math.floor((now.getTime() - new Date(deal.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
        let attention = daysSinceUpdate > 30;
        // Enhanced close probability: later stage = higher probability
        let closeProbability = 0.1;
        if (stageTypeMap[deal.stageId]?.isWon) closeProbability = 1;
        else if (stageTypeMap[deal.stageId]?.isLost) closeProbability = 0;
        else if (stageOrderMap[deal.stageId]) closeProbability = Math.min(0.1 + 0.2 * stageOrderMap[deal.stageId], 0.9);

        // Enhanced AI recommendation logic
        let recommendation = '';
        if (attention) {
          recommendation = 'Nachfassen notwendig';
        } else if (closeProbability === 1) {
          recommendation = 'Deal gewonnen! Ergebnis erfassen.';
        } else if (closeProbability === 0) {
          recommendation = 'Deal verloren. Analyse und Learnings.';
        } else if (closeProbability > 0.7) {
          recommendation = 'Hohe Abschlusswahrscheinlichkeit. Letzte Schritte einleiten.';
        } else if (closeProbability > 0.4) {
          recommendation = 'Deal entwickelt sich. Engagement fortsetzen.';
        } else {
          recommendation = 'Frühphase. Qualifizieren und kontaktieren.';
        }

        return {
          id: deal.id,
          name: deal.name,
          amount: deal.amount,
          stageId: deal.stageId,
          stageName: stageMap[deal.stageId] || deal.stageId,
          daysSinceUpdate,
          attention,
          closeProbability,
          recommendation,
        };
      });
      return { insights };
    }

  // Notes
  async addNote(dealId: string, content: string, user: any) {
    return this.prisma.note.create({
      data: {
        dealId,
        content,
        createdByUserId: user.userId,
      },
    });
  }

  async getNotes(dealId: string) {
    return this.prisma.note.findMany({
      where: { dealId },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Attachments
  async addAttachment(dealId: string, url: string, filename: string, user: any) {
    return this.prisma.attachment.create({
      data: {
        dealId,
        url,
        filename,
        uploadedByUserId: user.userId,
      },
    });
  }

  async getAttachments(dealId: string) {
    return this.prisma.attachment.findMany({
      where: { dealId },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadAttachment(dealId: string, file: Express.Multer.File, user: any) {
    const url = await this.storage.uploadFile(`deals/${dealId}`, file);
    return this.prisma.attachment.create({
      data: {
        dealId,
        url,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedByUserId: user.userId,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
  }

  async deleteAttachment(attachmentId: string, user: any) {
    const att = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!att) throw new NotFoundException('Anhang nicht gefunden');
    if (att.url.includes('supabase.co')) {
      await this.storage.deleteFile(att.url).catch(() => {});
    }
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
    return { deleted: true };
  }

  // Helper: get stage weight for scoring
  private async getStageWeight(stageId: string): Promise<number> {
      const stage = await this.prisma.dealStage.findUnique({ where: { id: stageId } });
      if (!stage) return 1;
      // Example: weight by order (later stages = higher weight)
      return 1 + (stage.order || 0) * 0.2;
    }

    // Helper: calculate deal score
    private async calculateDealScore(amount: number, stageId: string): Promise<number> {
      const weight = await this.getStageWeight(stageId);
      return Math.round(amount * weight);
    }
  async create(body: any, user: any): Promise<Deal> {
    if (!user?.userId) throw new ForbiddenException('Authentication required');
    const ownerUserId = body.ownerUserId || user.userId;
    const createdByUserId = body.createdByUserId || user.userId;
    const amount = body.amount || 0;
    const stageId = body.stageId;
    const dealScore = await this.calculateDealScore(amount, stageId);
    const deal = await this.prisma.deal.create({
      data: {
        name: body.name,
        accountId: body.accountId,
        stageId,
        amount,
        currency: 'CHF',
        probability: 0,
        dealScore,
        expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : new Date(),
        ownerUserId,
        createdByUserId,
        customFields: body.customFields || {},
      },
    });
    await this.activityLogger.logActivity({ actorUserId: user.userId, entityType: 'Deal', entityId: deal.id, action: 'CREATE', payloadJson: { name: deal.name } });
    return deal;
  }

  async update(id: string, body: any, user: any): Promise<Deal> {
    if (!user?.userId) throw new ForbiddenException('Authentication required');
    const deal = await this.prisma.deal.findUnique({ where: { id } });
    if (!deal) throw new NotFoundException('Deal not found');
    const effectiveUserId = user.userId;
    if (user && user.role !== Role.ADMIN && deal.ownerUserId !== effectiveUserId && deal.createdByUserId !== effectiveUserId) {
      throw new ForbiddenException('Access denied');
    }
    const changes: Record<string, { from: any; to: any }> = {};
    if (body.name && body.name !== deal.name) changes['Name'] = { from: deal.name, to: body.name };
    if (body.amount !== undefined && Number(body.amount) !== deal.amount) changes['Betrag'] = { from: deal.amount, to: Number(body.amount) };

    const amount = body.amount !== undefined ? body.amount : deal.amount;
    const stageId = body.stageId || deal.stageId;
    const dealScore = await this.calculateDealScore(amount, stageId);
    const updated = await this.prisma.deal.update({
      where: { id },
      data: {
        name: body.name,
        stageId,
        amount,
        currency: 'CHF',
        dealScore,
        expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : undefined,
        followUpDate: body.followUpDate !== undefined ? (body.followUpDate ? new Date(body.followUpDate) : null) : undefined,
        phases: body.phases !== undefined ? body.phases : undefined,
        phaseBudgets: body.phaseBudgets !== undefined ? body.phaseBudgets : undefined,
        customFields: body.customFields,
      },
    });
    await this.activityLogger.logActivity({ actorUserId: user.userId, entityType: 'Deal', entityId: id, action: 'UPDATE', payloadJson: { name: updated.name, ...(Object.keys(changes).length > 0 ? { changes } : {}) } });
    return updated;
  }

  async delete(id: string, user: any): Promise<{ deleted: boolean }> {
    const deal = await this.prisma.deal.findUnique({ where: { id } });
    if (!deal) throw new NotFoundException('Deal not found');
    if (user && user.role !== Role.ADMIN && deal.ownerUserId !== user.userId && deal.createdByUserId !== user.userId) {
      throw new ForbiddenException('Access denied');
    }
    await this.prisma.deal.delete({ where: { id } });
    await this.activityLogger.logActivity({ actorUserId: user.userId, entityType: 'Deal', entityId: id, action: 'DELETE', payloadJson: { name: deal.name } });
    return { deleted: true };
  }

  // List all deal stages for frontend board columns
  async getDealStages() {
    return this.prisma.dealStage.findMany({
      orderBy: { order: 'asc' },
    });
  }

  async findAll(user: any): Promise<Deal[]> {
    // Always return all deals, including stage and account info
    return this.prisma.deal.findMany({
      include: {
        stage: true,
        account: true,
      },
    });
  }

  async findById(id: string, _user?: any): Promise<Deal> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: { stage: true, account: true, owner: { select: { id: true, name: true } }, creator: { select: { id: true, name: true } } },
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  async changeStage(dealId: string, dto: { toStageId: string }, user: any) {
    // 1. Find deal
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) throw new NotFoundException('Deal not found');
    // 2. Permission check
    if (user.role !== Role.ADMIN && deal.ownerUserId !== user.userId && deal.createdByUserId !== user.userId) {
      throw new ForbiddenException('Access denied');
    }
    // 3. Find target stage
    const toStage = await this.prisma.dealStage.findUnique({ where: { id: dto.toStageId } });
    if (!toStage) throw new NotFoundException('Target stage not found');
    // 4. Transaction: update deal, log activity
    const [updatedDeal, _] = await this.prisma.$transaction([
      this.prisma.deal.update({
        where: { id: dealId },
        data: { stageId: dto.toStageId },
      }),
      this.prisma.activity.create({
        data: {
          actorUserId: user.userId,
          entityType: 'Deal',
          entityId: dealId,
          action: 'change_stage',
          payloadJson: {
            fromStageId: deal.stageId,
            toStageId: dto.toStageId,
          },
        },
      }),
    ]);
    if (deal.ownerUserId && deal.ownerUserId !== user.userId) {
      this.notifications.createForUser(
        deal.ownerUserId, 'DEAL_STAGE_CHANGED',
        'Deal-Phase geändert',
        `"${deal.name}" wurde in "${toStage.name}" verschoben`,
        'Deal', dealId, `/deals/${dealId}`,
      ).catch(() => {});
    }
    return updatedDeal;
  }
}
