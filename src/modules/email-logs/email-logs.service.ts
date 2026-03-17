import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class EmailLogsService {
  constructor(private prisma: PrismaService) {}

  async findForEntity(entityType: 'account' | 'contact', entityId: string) {
    const where = entityType === 'account' ? { accountId: entityId } : { contactId: entityId };
    return this.prisma.emailLog.findMany({
      where,
      include: { loggedBy: { select: { id: true, name: true } } },
      orderBy: { loggedAt: 'desc' },
    });
  }

  async create(data: any, user: any) {
    return this.prisma.emailLog.create({
      data: {
        subject: data.subject,
        body: data.body || null,
        direction: data.direction || 'OUTBOUND',
        accountId: data.accountId || null,
        contactId: data.contactId || null,
        loggedByUserId: user.userId,
      },
      include: { loggedBy: { select: { id: true, name: true } } },
    });
  }

  async delete(id: string) {
    await this.prisma.emailLog.delete({ where: { id } });
    return { deleted: true };
  }
}
