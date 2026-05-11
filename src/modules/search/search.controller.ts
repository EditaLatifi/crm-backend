import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PrismaService } from '../../common/prisma.service';

@Controller('search')
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async search(@Query('q') q: string, @Request() req: any) {
    if (!q || q.trim().length < 2) return { accounts: [], contacts: [], deals: [], tasks: [] };
    const term = q.trim();

    const [accounts, contacts, deals, tasks] = await Promise.all([
      this.prisma.account.findMany({
        where: { name: { contains: term, mode: 'insensitive' } },
        select: { id: true, name: true, type: true },
        take: 5,
      }),
      this.prisma.contact.findMany({
        where: {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, email: true },
        take: 5,
      }),
      this.prisma.deal.findMany({
        where: { name: { contains: term, mode: 'insensitive' } },
        select: { id: true, name: true, amount: true, currency: true, stage: { select: { name: true } } },
        take: 5,
      }),
      this.prisma.task.findMany({
        where: { title: { contains: term, mode: 'insensitive' } },
        select: { id: true, title: true, status: true, priority: true },
        take: 5,
      }),
    ]);

    return { accounts, contacts, deals, tasks };
  }

  @UseGuards(JwtAuthGuard)
  @Get('counts')
  async counts() {
    const [accounts, contacts, deals, projects, tasks] = await Promise.all([
      this.prisma.account.count(),
      this.prisma.contact.count(),
      this.prisma.deal.count(),
      this.prisma.project.count(),
      this.prisma.task.count({ where: { status: { not: 'DONE' } } }),
    ]);
    return { accounts, contacts, deals, projects, tasks };
  }
}
