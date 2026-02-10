import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { forbidden, notFound } from '../../common/error/error.response';
import { Deal, Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class DealsService {
  constructor(private prisma: PrismaService) {}

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
          recommendation = 'Follow up soon';
        } else if (closeProbability === 1) {
          recommendation = 'Deal won! Celebrate and record outcome.';
        } else if (closeProbability === 0) {
          recommendation = 'Deal lost. Review and learn.';
        } else if (closeProbability > 0.7) {
          recommendation = 'High chance to close. Push for final steps.';
        } else if (closeProbability > 0.4) {
          recommendation = 'Deal progressing. Keep nurturing.';
        } else {
          recommendation = 'Early stage. Qualify and engage.';
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
      orderBy: { createdAt: 'desc' },
    });
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
    // Fallback to a default user for local/dev/testing if user is missing
    const fallbackUserId = 'ed5160e4-ce26-4517-9f6d-eb7128060a72'; // Use a real userId from your DB
    const ownerUserId = body.ownerUserId ? body.ownerUserId : (user?.userId || fallbackUserId);
    const createdByUserId = body.createdByUserId ? body.createdByUserId : (user?.userId || fallbackUserId);
    if (!ownerUserId || !createdByUserId) {
      throw new Error('ownerUserId and createdByUserId are required');
    }
    const amount = body.amount || 0;
    const stageId = body.stageId;
    const dealScore = await this.calculateDealScore(amount, stageId);
    return this.prisma.deal.create({
      data: {
        name: body.name,
        accountId: body.accountId,
        stageId,
        amount,
        currency: body.currency || 'USD',
        probability: body.probability || 0,
        dealScore,
        expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : new Date(),
        ownerUserId,
        createdByUserId,
        customFields: body.customFields || {},
      },
    });
  }

  async update(id: string, body: any, user: any): Promise<Deal> {
    const fallbackUserId = 'ed5160e4-ce26-4517-9f6d-eb7128060a72'; // Use a real userId from your DB
    const deal = await this.prisma.deal.findUnique({ where: { id } });
    if (!deal) throw new NotFoundException('Deal not found');
    const effectiveUserId = user?.userId || fallbackUserId;
    if (user && user.role !== Role.ADMIN && deal.ownerUserId !== effectiveUserId && deal.createdByUserId !== effectiveUserId) {
      throw new ForbiddenException('Access denied');
    }
    const amount = body.amount !== undefined ? body.amount : deal.amount;
    const stageId = body.stageId || deal.stageId;
    const dealScore = await this.calculateDealScore(amount, stageId);
    return this.prisma.deal.update({
      where: { id },
      data: {
        name: body.name,
        stageId,
        amount,
        currency: body.currency,
        probability: body.probability,
        dealScore,
        expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : undefined,
        customFields: body.customFields,
      },
    });
  }

  async delete(id: string, user: any): Promise<{ deleted: boolean }> {
    const deal = await this.prisma.deal.findUnique({ where: { id } });
    if (!deal) throw new NotFoundException('Deal not found');
    if (user && user.role !== Role.ADMIN && deal.ownerUserId !== user.userId && deal.createdByUserId !== user.userId) {
      throw new ForbiddenException('Access denied');
    }
    await this.prisma.deal.delete({ where: { id } });
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

  async findById(id: string, user: any): Promise<Deal> {
    const deal = await this.prisma.deal.findUnique({ where: { id } });
    if (!deal) throw new NotFoundException('Deal not found');
    if (!user || !user.role) {
      return deal;
    }
    if (user.role !== Role.ADMIN && deal.ownerUserId !== user.userId && deal.createdByUserId !== user.userId) {
      throw new ForbiddenException('Access denied');
    }
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
    return updatedDeal;
  }
}
