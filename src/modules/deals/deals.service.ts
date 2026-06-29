import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { forbidden, notFound } from '../../common/error/error.response';
import { Deal, Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { ActivityLoggerService } from '../activity/activity-logger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SupabaseStorageService } from '../documents/supabase-storage.service';
import { EmailService } from '../email/email.service';

// SIA Leistungsphasen code -> name, used when converting legacy checkbox-based deals into project phases.
const SIA_PHASE_NAMES: Record<string, string> = {
  '10': 'Strategie/Planung', '20': 'Vorstudie', '31': 'Vorprojekt', '32': 'Bauprojekt',
  '33': 'Bewilligungsverfahren', '41': 'Ausschreibung', '51': 'Ausführungsplanung',
  '52': 'Ausführung', '53': 'Inbetriebnahme', '61': 'Bewirtschaftung',
};

// DealPhaseStatus -> PhaseStatus. ON_HOLD has no project equivalent, so it falls back to PENDING.
const DEAL_TO_PROJECT_PHASE_STATUS: Record<string, 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED'> = {
  PENDING: 'PENDING', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED', ON_HOLD: 'PENDING',
};

@Injectable()
export class DealsService {
  constructor(
    private prisma: PrismaService,
    private activityLogger: ActivityLoggerService,
    private notifications: NotificationsService,
    private storage: SupabaseStorageService,
    private email: EmailService,
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
      avgDealSize: Math.round((avgDeal._avg.amount || 0) * 20) / 20,
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

  async create(body: any, user: any): Promise<Deal> {
    if (!user?.userId) throw new ForbiddenException('Authentication required');
    const ownerUserId = body.ownerUserId || user.userId;
    const createdByUserId = body.createdByUserId || user.userId;
    const amount = body.amount || 0;
    const stageId = body.stageId;
    const deal = await this.prisma.deal.create({
      data: {
        name: body.name,
        accountId: body.accountId,
        stageId,
        amount,
        currency: (body.currency === 'EUR' ? 'EUR' : 'CHF'),
        expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : new Date(),
        ownerUserId,
        createdByUserId,
        customFields: body.customFields || {},
      },
    });
    await this.activityLogger.logActivity({ actorUserId: user.userId, entityType: 'Deal', entityId: deal.id, action: 'CREATE', payloadJson: { name: deal.name } });

    // Notify deal owner if different from creator
    if (ownerUserId && ownerUserId !== user.userId) {
      this.notifications.createForUser(
        ownerUserId, 'DEAL_CREATED',
        'Neuer Deal erstellt',
        `"${deal.name}" wurde dir zugewiesen`,
        'Deal', deal.id, `/deals/${deal.id}`,
      ).catch(() => {});
    }
    // Also notify creator (confirmation)
    this.notifications.createForUser(
      user.userId, 'DEAL_CREATED',
      'Deal erstellt',
      `Du hast den Deal "${deal.name}" erstellt`,
      'Deal', deal.id, `/deals/${deal.id}`,
    ).catch(() => {});

    const owner = ownerUserId ? await this.prisma.user.findUnique({ where: { id: ownerUserId } }) : null;
    const creator = await this.prisma.user.findUnique({ where: { id: createdByUserId } });
    const account = deal.accountId ? await this.prisma.account.findUnique({ where: { id: deal.accountId } }) : null;
    const recipients = Array.from(new Set([owner?.email, creator?.email].filter(Boolean) as string[]));
    if (recipients.length > 0) {
      const link = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/deals/${deal.id}`;
      this.email.send({
        to: recipients,
        subject: `Neuer Deal erstellt: ${deal.name}`,
        text: [
          `Ein neuer Deal wurde erstellt.`,
          ``,
          `Deal:        ${deal.name}`,
          `Konto:       ${account?.name || '—'}`,
          `Betrag:      ${deal.amount} ${deal.currency}`,
          `Fälligkeit:  ${deal.expectedCloseDate.toISOString().slice(0, 10)}`,
          `Verantwortlich: ${owner?.name || creator?.name || '—'}`,
          ``,
          `Link: ${link}`,
        ].join('\n'),
        accountId: deal.accountId,
        loggedByUserId: createdByUserId,
        entityType: 'Deal',
        entityId: deal.id,
      }).catch(() => {});
    }
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
    const updated = await this.prisma.deal.update({
      where: { id },
      data: {
        name: body.name,
        stageId,
        amount,
        currency: body.currency ? (body.currency === 'EUR' ? 'EUR' : 'CHF') : undefined,
        expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : undefined,
        followUpDate: body.followUpDate !== undefined ? (body.followUpDate ? new Date(body.followUpDate) : null) : undefined,
        phases: body.phases !== undefined ? body.phases : undefined,
        phaseBudgets: body.phaseBudgets !== undefined ? body.phaseBudgets : undefined,
        customFields: body.customFields,
      },
    });
    await this.activityLogger.logActivity({ actorUserId: user.userId, entityType: 'Deal', entityId: id, action: 'UPDATE', payloadJson: { name: updated.name, ...(Object.keys(changes).length > 0 ? { changes } : {}) } });

    // If the stage changed to a "won" stage via the edit form, auto-create the project too.
    let createdProjectId: string | null = null;
    if (stageId !== deal.stageId) {
      const toStage = await this.prisma.dealStage.findUnique({ where: { id: stageId } });
      if (toStage?.isWon) createdProjectId = await this.ensureProjectForWonDeal(deal, toStage, user);
    }
    return { ...updated, createdProjectId } as Deal;
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

  async findAll(user: any, page = 1, pageSize = 50, search?: string): Promise<{ data: Deal[]; total: number; page: number; pageSize: number }> {
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { account: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        include: {
          stage: { select: { id: true, name: true, order: true, isWon: true, isLost: true } },
          account: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
        },
        skip: (page - 1) * pageSize,
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.deal.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  async findById(id: string, _user?: any): Promise<Deal> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: {
        stage: true,
        account: true,
        owner: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        dealPhases: { select: { id: true, code: true, name: true, hourBudget: true, budgetChf: true, parentId: true, responsibleUserId: true, responsible: { select: { id: true, name: true } } } },
      },
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return deal;
  }

  // ─── Deal Phases (with sub-phases) ───
  async listPhases(dealId: string, user?: any) {
    // Single phase editor: make sure every SIA phase the user ticked on the deal is listed here as a
    // real row (so they can set Mitarbeiter/Stundenbudget/Zahlungsplan + add sub-phases in one place),
    // and migrate any budget that older deals stored in the legacy phaseBudgets map onto its phase row.
    // Skip once the deal became a project — phases then live on the project.
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId }, select: { phases: true, phaseBudgets: true } });
    const linkedProject = await this.prisma.project.findFirst({ where: { dealId }, select: { id: true } });
    if (!linkedProject) {
      const selected: string[] = Array.isArray((deal as any)?.phases) ? (deal as any).phases.map(String) : [];
      const pb = (deal?.phaseBudgets && typeof deal.phaseBudgets === 'object' && !Array.isArray(deal.phaseBudgets))
        ? (deal.phaseBudgets as Record<string, any>) : {};
      const legacyCodes = Object.keys(pb).filter((c) => Number(pb[c]) > 0);
      if (selected.length || legacyCodes.length) {
        const existing = await this.prisma.dealPhase.findMany({ where: { dealId }, select: { id: true, code: true, hourBudget: true } });
        const byCode = new Map<string, any>(existing.map((e) => [String(e.code), e]));
        let order = await this.prisma.dealPhase.count({ where: { dealId, parentId: null } });
        const ensureMain = async (code: string) => {
          if (byCode.has(code)) return byCode.get(code);
          const row = await this.prisma.dealPhase.create({ data: { dealId, code, name: SIA_PHASE_NAMES[code] || `Phase ${code}`, parentId: null, order: order++ } });
          byCode.set(code, row); return row;
        };
        // 1) selected SIA main phases
        for (const code of selected) await ensureMain(code);
        // 2) legacy phaseBudgets -> the phase row's hourBudget (creating the row, sub under its main, if needed)
        for (const code of legacyCodes) {
          let row = byCode.get(code);
          if (!row) {
            let parentId: string | null = null;
            if (code.includes('.')) { const parent = await ensureMain(code.split('.')[0]); parentId = parent.id; }
            row = await this.prisma.dealPhase.create({ data: { dealId, code, name: SIA_PHASE_NAMES[code] || `Phase ${code}`, parentId, order: order++ } });
            byCode.set(code, row);
          }
          if (row.hourBudget == null) await this.prisma.dealPhase.update({ where: { id: row.id }, data: { hourBudget: Number(pb[code]) } });
        }
        // 3) legacy map fully migrated → clear it so it never double-counts or caps again
        if (legacyCodes.length) await this.prisma.deal.update({ where: { id: dealId }, data: { phaseBudgets: {} } });
      }
    }

    const phases = await this.prisma.dealPhase.findMany({
      where: { dealId, parentId: null },
      include: {
        children: {
          include: {
            payments: true,
            responsible: { select: { id: true, name: true } },
          },
          orderBy: { order: 'asc' },
        },
        payments: true,
        responsible: { select: { id: true, name: true } },
      },
      orderBy: { order: 'asc' },
    });
    if (user?.role !== Role.ADMIN) {
      return phases.map((p: any) => ({
        ...p,
        payments: [],
        children: (p.children || []).map((c: any) => ({ ...c, payments: [] })),
      }));
    }
    return phases;
  }

  async createPhase(dealId: string, body: any, user: any) {
    const order = body.order ?? (await this.prisma.dealPhase.count({ where: { dealId, parentId: body.parentId || null } }));
    const phase = await this.prisma.dealPhase.create({
      data: {
        dealId,
        code: body.code || '',
        name: body.name,
        description: body.description ?? null,
        order,
        parentId: body.parentId || null,
        hourBudget: body.hourBudget ?? null,
        budgetChf: body.budgetChf ?? null,
        offeredHours: body.offeredHours ?? null,
        status: body.status ?? 'PENDING',
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes ?? null,
        responsibleUserId: body.responsibleUserId ?? null,
      },
    });
    if (body.parentId) {
      const parent = await this.prisma.dealPhase.findUnique({ where: { id: body.parentId } });
      if (parent) {
        await this.prisma.dealSubPhaseTemplate.create({
          data: {
            parentCode: parent.code,
            name: phase.name,
            order: phase.order,
            createdByUserId: user.userId,
          },
        }).catch(() => {});
      }
    }
    return phase;
  }

  async updatePhase(phaseId: string, body: any) {
    return this.prisma.dealPhase.update({
      where: { id: phaseId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.code !== undefined && { code: body.code }),
        ...(body.order !== undefined && { order: body.order }),
        ...(body.hourBudget !== undefined && { hourBudget: body.hourBudget }),
        ...(body.budgetChf !== undefined && { budgetChf: body.budgetChf }),
        ...(body.offeredHours !== undefined && { offeredHours: body.offeredHours }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.responsibleUserId !== undefined && { responsibleUserId: body.responsibleUserId || null }),
      },
    });
  }

  async deletePhase(phaseId: string) {
    await this.prisma.dealPhase.delete({ where: { id: phaseId } });
    return { deleted: true };
  }

  async bulkUpdatePhaseBudgetHours(
    dealId: string,
    updates: Array<{ phaseId: string; hourBudget: number | null }>,
  ) {
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new BadRequestException('Mindestens eine Phase erforderlich.');
    }
    const ids = updates.map(u => u.phaseId);
    const updateIds = new Set(ids);
    for (const u of updates) {
      if (u.hourBudget != null && (typeof u.hourBudget !== 'number' || u.hourBudget < 0 || !Number.isFinite(u.hourBudget))) {
        throw new BadRequestException('Ungültige Budgetstunden.');
      }
    }

    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      select: { id: true, phaseBudgets: true },
    });
    if (!deal) throw new BadRequestException('Deal nicht gefunden.');

    const allPhases = await this.prisma.dealPhase.findMany({
      where: { dealId },
      select: { id: true, hourBudget: true },
    });
    const allPhaseIds = new Set(allPhases.map(p => p.id));
    for (const id of ids) {
      if (!allPhaseIds.has(id)) {
        throw new BadRequestException('Phase gehört nicht zu diesem Deal.');
      }
    }

    // Sum cap: total of resulting DealPhase.hourBudget must not exceed sum of deal.phaseBudgets (SIA totals).
    // If deal has no phaseBudgets set, no cap is enforced.
    const phaseBudgets = (deal.phaseBudgets && typeof deal.phaseBudgets === 'object' && !Array.isArray(deal.phaseBudgets))
      ? (deal.phaseBudgets as Record<string, any>)
      : {};
    const siaTotal = Object.values(phaseBudgets).reduce((s: number, v: any) => {
      const n = Number(v);
      return s + (Number.isFinite(n) ? n : 0);
    }, 0);

    if (siaTotal > 0) {
      const updatesById = new Map(updates.map(u => [u.phaseId, u.hourBudget]));
      const prospective = allPhases.reduce((s, p) => {
        const next = updateIds.has(p.id) ? updatesById.get(p.id) ?? null : p.hourBudget;
        return s + (next ?? 0);
      }, 0);
      // Round to 2 decimals to avoid floating-point noise pushing equal sums over.
      if (Math.round(prospective * 100) > Math.round(siaTotal * 100)) {
        throw new BadRequestException(
          `Stundenbudget übersteigt SIA-Kontingent: ${prospective.toFixed(1)}h / ${siaTotal.toFixed(1)}h.`,
        );
      }
    }

    await this.prisma.$transaction(
      updates.map(u =>
        this.prisma.dealPhase.update({
          where: { id: u.phaseId },
          data: { hourBudget: u.hourBudget },
        }),
      ),
    );
    return { updated: updates.length, siaTotal };
  }

  async listSubPhaseTemplates(parentCode?: string) {
    return this.prisma.dealSubPhaseTemplate.findMany({
      where: parentCode ? { parentCode } : {},
      orderBy: [{ parentCode: 'asc' }, { order: 'asc' }],
    });
  }

  // ─── Phase Payment Plan ───
  async listPayments(phaseId: string) {
    return this.prisma.dealPhasePayment.findMany({
      where: { dealPhaseId: phaseId },
      orderBy: { dueDate: 'asc' },
    });
  }

  async createPayment(phaseId: string, body: any) {
    // Validate percentage sum doesn't exceed 100%
    if (body.percentage != null) {
      const existing = await this.prisma.dealPhasePayment.findMany({
        where: { dealPhaseId: phaseId },
        select: { percentage: true },
      });
      const currentSum = existing.reduce((s, p) => s + (p.percentage || 0), 0);
      if (currentSum + body.percentage > 100) {
        throw new ForbiddenException(`Prozentsumme würde ${(currentSum + body.percentage).toFixed(1)}% ergeben. Maximum: 100%.`);
      }
    }
    return this.prisma.dealPhasePayment.create({
      data: {
        dealPhaseId: phaseId,
        label: body.label,
        amount: body.amount ?? null,
        percentage: body.percentage ?? null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      },
    });
  }

  async updatePayment(paymentId: string, body: any) {
    return this.prisma.dealPhasePayment.update({
      where: { id: paymentId },
      data: {
        ...(body.label !== undefined && { label: body.label }),
        ...(body.amount !== undefined && { amount: body.amount }),
        ...(body.percentage !== undefined && { percentage: body.percentage }),
        ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
      },
    });
  }

  async deletePayment(paymentId: string) {
    await this.prisma.dealPhasePayment.delete({ where: { id: paymentId } });
    return { deleted: true };
  }

  // ─── Deal Contacts (n:m) ───
  async listDealContacts(dealId: string) {
    return this.prisma.dealContact.findMany({
      where: { dealId },
      include: { contact: { select: { id: true, name: true, email: true, phone: true, title: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addDealContact(dealId: string, contactId: string) {
    return this.prisma.dealContact.create({
      data: { dealId, contactId },
      include: { contact: { select: { id: true, name: true, email: true, phone: true, title: true } } },
    });
  }

  async removeDealContact(dealId: string, contactId: string) {
    await this.prisma.dealContact.deleteMany({ where: { dealId, contactId } });
    return { deleted: true };
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
    // 4. Resolve from-stage name for activity log
    const fromStage = await this.prisma.dealStage.findUnique({ where: { id: deal.stageId } });

    // 5. Transaction: update deal, log activity
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
            name: deal.name,
            fromStageId: deal.stageId,
            toStageId: dto.toStageId,
            fromStageName: fromStage?.name || deal.stageId,
            toStageName: toStage.name,
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

    // Auto-create Project when Deal is won (if no project exists yet)
    const createdProjectId = await this.ensureProjectForWonDeal(deal, toStage, user);

    return { ...updatedDeal, createdProjectId };
  }

  /**
   * When a deal enters a "won" stage, create its project (idempotent) and copy all phases —
   * main phases as budget carriers plus their sub-phases (organization only) under each parent.
   * Returns the project id (existing or newly created), or null if the stage is not a won stage.
   */
  private async ensureProjectForWonDeal(deal: Deal, toStage: { isWon: boolean }, user: any): Promise<string | null> {
    if (!toStage.isWon) return null;
    const dealId = deal.id;
    const existingProject = await this.prisma.project.findFirst({ where: { dealId } });
    if (existingProject) return existingProject.id;

    const account = deal.accountId ? await this.prisma.account.findUnique({ where: { id: deal.accountId } }) : null;
    try {
      const newProject = await this.prisma.project.create({
        data: {
          name: deal.name,
          dealId,
          accountId: deal.accountId,
          ownerUserId: deal.ownerUserId || user.userId,
          createdByUserId: user.userId,
          address: account?.address || '',
          status: 'ACTIVE',
          type: 'ARCHITECTURE',
          currency: deal.currency || 'CHF',
          // Carry the deal's expected close date as the project's expected end date (was dropped before).
          expectedEndDate: (deal as any).expectedCloseDate || undefined,
        },
      });

      // Sync DealPhases -> ProjectPhases (main phases + their sub-phases, with origin link).
      // Map each DealPhase id to the created ProjectPhase id so children can reference their parent.
      const dealPhaseToProjectPhase = new Map<string, string>();

      const mainPhases = await this.prisma.dealPhase.findMany({
        where: { dealId, parentId: null },
        orderBy: { order: 'asc' },
      });
      // Track which SIA codes already exist as structured phases, so the checkbox-phases below
      // are MERGED in (not skipped) when a deal has both structured rows AND ticked SIA phases.
      const existingCodes = new Set<string>();
      let maxOrder = -1;
      for (const dp of mainPhases) {
        const pp = await this.prisma.projectPhase.create({
          data: {
            projectId: newProject.id,
            name: dp.name,
            description: dp.description || undefined,
            order: dp.order,
            code: dp.code || undefined,
            status: DEAL_TO_PROJECT_PHASE_STATUS[dp.status] || 'PENDING',
            budgetHours: dp.hourBudget ?? undefined,
            budgetChf: dp.budgetChf ?? undefined,
            offeredHours: dp.offeredHours ?? undefined,
            dueDate: dp.dueDate || undefined,
            notes: dp.notes || undefined,
            responsibleUserId: dp.responsibleUserId || undefined,
            originDealPhaseId: dp.id,
          },
        });
        dealPhaseToProjectPhase.set(dp.id, pp.id);
        if (dp.code) existingCodes.add(String(dp.code));
        if (typeof dp.order === 'number' && dp.order > maxOrder) maxOrder = dp.order;
      }

      // Sub-phases: organization only — copied under their parent, no budget bar at project level.
      const subPhases = await this.prisma.dealPhase.findMany({
        where: { dealId, parentId: { not: null } },
        orderBy: { order: 'asc' },
      });
      for (const sp of subPhases) {
        const parentProjectPhaseId = sp.parentId ? dealPhaseToProjectPhase.get(sp.parentId) : undefined;
        try {
          const spp = await this.prisma.projectPhase.create({
            data: {
              projectId: newProject.id,
              name: sp.name,
              description: sp.description || undefined,
              order: sp.order,
              code: sp.code || undefined,
              status: DEAL_TO_PROJECT_PHASE_STATUS[sp.status] || 'PENDING',
              // Carry the user-entered sub-phase budgets too (was dropped before) so nothing is lost.
              budgetHours: sp.hourBudget ?? undefined,
              budgetChf: sp.budgetChf ?? undefined,
              offeredHours: sp.offeredHours ?? undefined,
              dueDate: sp.dueDate || undefined,
              notes: sp.notes || undefined,
              responsibleUserId: sp.responsibleUserId || undefined,
              originDealPhaseId: sp.id,
              parentPhaseId: parentProjectPhaseId,
            },
          });
          // Register the sub-phase so its Zahlungsplan payments are copied too (was main-phase only).
          dealPhaseToProjectPhase.set(sp.id, spp.id);
        } catch (e: any) { console.error(`[Deals] Failed to copy sub-phase ${sp.code} on conversion:`, e?.message); }
      }

      // MERGE the ticked SIA phases (deal.phases[] + deal.phaseBudgets{}) — but only those NOT already
      // created as structured phases. This covers BOTH the legacy case (no DealPhase rows at all) AND
      // the mixed case (some structured rows + extra ticked SIA phases), so nothing the user selected is lost.
      {
        const codes = Array.isArray((deal as any).phases) ? (deal as any).phases : [];
        const budgets = (deal as any).phaseBudgets && typeof (deal as any).phaseBudgets === 'object' ? (deal as any).phaseBudgets : {};
        let order = maxOrder + 1;
        for (const raw of codes) {
          const code = String(raw);
          if (existingCodes.has(code)) continue; // already carried over as a structured phase
          existingCodes.add(code);
          const budget = Number(budgets[code] ?? budgets[raw]);
          await this.prisma.projectPhase.create({
            data: {
              projectId: newProject.id,
              name: SIA_PHASE_NAMES[code] || `Phase ${code}`,
              code,
              order: order++,
              status: 'PENDING',
              budgetHours: Number.isFinite(budget) && budget > 0 ? budget : undefined,
            },
          }).catch(() => {});
        }
      }

      // Copy the deal Zahlungsplan into the project as payment-reminder tasks on the matching phase.
      try {
        for (const [dealPhaseId, projPhaseId] of dealPhaseToProjectPhase.entries()) {
          const payments = await this.prisma.dealPhasePayment.findMany({ where: { dealPhaseId } });
          for (const pay of payments) {
            const amountStr = pay.amount != null ? `${pay.amount} ${deal.currency || 'CHF'}` : (pay.percentage != null ? `${pay.percentage}%` : '');
            await this.prisma.task.create({
              data: {
                title: `Zahlung: ${pay.label}${amountStr ? ` (${amountStr})` : ''}`,
                status: 'OPEN',
                priority: 'MEDIUM',
                projectId: newProject.id,
                projectPhaseId: projPhaseId,
                accountId: deal.accountId || undefined,
                isPaymentReminder: true,
                dueDate: pay.dueDate || undefined,
                createdByUserId: user.userId,
              },
            }).catch((e: any) => console.error(`[Deals] Failed to copy payment "${pay.label}" on conversion:`, e?.message));
          }
        }
      } catch (e: any) { console.error('[Deals] Zahlungsplan copy failed on conversion:', e?.message); }

      return newProject.id;
    } catch (err: any) {
      console.error('[Deals] Auto-create project failed:', err.message);
      return null;
    }
  }
}
