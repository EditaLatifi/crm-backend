import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {

  // Rename English deal stages to German (for existing databases)
  const stageRenames: Record<string, string> = {
    'New': 'Erstkontakt',
    'Prospecting': 'Erstkontakt',
    'Qualified': 'Qualifiziert',
    'Proposal': 'Angebot',
    'Negotiation': 'Verhandlung',
    'Won': 'Gewonnen',
    'Lost': 'Verloren',
  };
  for (const [oldName, newName] of Object.entries(stageRenames)) {
    await prisma.dealStage.updateMany({ where: { name: oldName }, data: { name: newName } });
  }

  // Create default deal stages (German)
  const stages = [
    { name: 'Erstkontakt', order: 1, isWon: false, isLost: false },
    { name: 'Qualifiziert', order: 2, isWon: false, isLost: false },
    { name: 'Angebot', order: 3, isWon: false, isLost: false },
    { name: 'Verhandlung', order: 4, isWon: false, isLost: false },
    { name: 'Gewonnen', order: 5, isWon: true, isLost: false },
    { name: 'Verloren', order: 6, isWon: false, isLost: true },
  ];
  for (const s of stages) {
    await prisma.dealStage.upsert({
      where: { name: s.name },
      update: { order: s.order, isWon: s.isWon, isLost: s.isLost },
      create: s,
    });
  }

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@crm.local' },
    update: {},
    create: {
      email: 'admin@crm.local',
      passwordHash: await bcrypt.hash('edita123', 10),
      name: 'Admin',
      role: 'ADMIN',
    },
  });

  // Create regular user
  const user = await prisma.user.upsert({
    where: { email: 'user@crm.local' },
    update: {},
    create: {
      email: 'user@crm.local',
      passwordHash: await bcrypt.hash('user123', 10),
      name: 'User',
      role: 'USER',
    },
  });

  // Create sample accounts (idempotent)
  const account1 = await prisma.account.upsert({
    where: { name: 'Acme Corporation' },
    update: {},
    create: {
      name: 'Acme Corporation',
      type: 'CLIENT',
      owner: { connect: { id: admin.id } },
      creator: { connect: { id: admin.id } },
    },
  });
  const account2 = await prisma.account.upsert({
    where: { name: 'Globex Inc.' },
    update: {},
    create: {
      name: 'Globex Inc.',
      type: 'PARTNER',
      owner: { connect: { id: user.id } },
      creator: { connect: { id: user.id } },
    },
  });

  // Create sample contacts (idempotent)
  await prisma.contact.upsert({
    where: { email: 'john@acme.com' },
    update: {},
    create: { name: 'John Doe', email: 'john@acme.com', accountId: account1.id },
  });
  await prisma.contact.upsert({
    where: { email: 'jane@globex.com' },
    update: {},
    create: { name: 'Jane Smith', email: 'jane@globex.com', accountId: account2.id },
  });

  // Create sample deals
  // Use the first stage for sample deals
  const stage = await prisma.dealStage.findFirst({
    where: { name: 'Erstkontakt' },
  }) || await prisma.dealStage.findFirst({ orderBy: { order: 'asc' } });
  if (!stage) throw new Error('No deal stages found');

  await prisma.deal.upsert({
    where: { name: 'Big Sale' },
    update: {},
    create: {
      name: 'Big Sale',
      accountId: account1.id,
      stageId: stage.id,
      amount: 10000,
      currency: 'CHF',
      expectedCloseDate: new Date(),
      ownerUserId: admin.id,
      createdByUserId: admin.id,
    },
  });
  await prisma.deal.upsert({
    where: { name: 'Renewal' },
    update: {},
    create: {
      name: 'Renewal',
      accountId: account2.id,
      stageId: stage.id,
      amount: 5000,
      currency: 'CHF',
      expectedCloseDate: new Date(),
      ownerUserId: user.id,
      createdByUserId: user.id,
    },
  });

  // Create sample tasks
  await prisma.task.createMany({
    data: [
      { title: 'Call John', accountId: account1.id, assignedToUserId: user.id, createdByUserId: admin.id, status: 'OPEN', priority: 'MEDIUM' },
      { title: 'Prepare contract', accountId: account2.id, assignedToUserId: admin.id, createdByUserId: user.id, status: 'OPEN', priority: 'HIGH' },
    ],
  });

  // Create sample time entries
  await prisma.timeEntry.createMany({
    data: [
      { userId: admin.id, accountId: account1.id, startedAt: new Date(), endedAt: new Date(), durationMinutes: 60, description: 'Demo call' },
      { userId: user.id, accountId: account2.id, startedAt: new Date(), endedAt: new Date(), durationMinutes: 120, description: 'Follow-up' },
    ],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
