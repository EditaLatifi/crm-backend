import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function upsertByName(model: any, name: string, data: any) {
  const existing = await model.findFirst({ where: { name } });
  if (existing) {
    return model.update({ where: { id: existing.id }, data });
  }
  return model.create({ data: { name, ...data } });
}

async function main() {

  // Rename English deal stages to German (for existing databases). Pipeline was simplified by client
  // request: "Qualifiziert" and "Verhandlung" removed → those map onto "Angebot".
  const stageRenames: Record<string, string> = {
    'New': 'Akquise',
    'Prospecting': 'Akquise',
    'Erstkontakt': 'Akquise',
    'Qualified': 'Angebot',
    'Qualifiziert': 'Angebot',
    'Proposal': 'Angebot',
    'Negotiation': 'Angebot',
    'Verhandlung': 'Angebot',
    'Won': 'Gewonnen',
    'Lost': 'Verloren',
  };
  for (const [oldName, newName] of Object.entries(stageRenames)) {
    await prisma.dealStage.updateMany({ where: { name: oldName }, data: { name: newName } });
  }

  // Default deal stages (simplified pipeline: no Qualifiziert / Verhandlung).
  const stages = [
    { name: 'Akquise', order: 1, isWon: false, isLost: false },
    { name: 'Angebot', order: 2, isWon: false, isLost: false },
    { name: 'Gewonnen', order: 3, isWon: true, isLost: false },
    { name: 'Verloren', order: 4, isWon: false, isLost: true },
  ];
  for (const s of stages) {
    await upsertByName(prisma.dealStage, s.name, { order: s.order, isWon: s.isWon, isLost: s.isLost });
  }

  // Default Baufortschritt construction milestones (idempotent)
  const defaultMilestones = [
    'Rückbau',
    'Baustelleninstallation',
    'Start Aushub',
    'Start Rohbau',
    'Fertig Kellerdecke',
    'Fertig EG-Decke',
    'Fertig Rohbau',
    'Fertig Aussenhülle',
    'Fertig Innenausbau',
    'Abnahme',
  ];
  for (let i = 0; i < defaultMilestones.length; i++) {
    const name = defaultMilestones[i];
    const existing = await prisma.constructionMilestone.findFirst({ where: { name } });
    if (!existing) {
      await prisma.constructionMilestone.create({
        data: { name, order: i, isDefault: true, active: true },
      });
    }
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
  let account1 = await prisma.account.findFirst({ where: { name: 'Acme Corporation' } });
  if (!account1) {
    account1 = await prisma.account.create({
      data: {
        name: 'Acme Corporation',
        type: 'CLIENT',
        owner: { connect: { id: admin.id } },
        creator: { connect: { id: admin.id } },
      },
    });
  }
  let account2 = await prisma.account.findFirst({ where: { name: 'Globex Inc.' } });
  if (!account2) {
    account2 = await prisma.account.create({
      data: {
        name: 'Globex Inc.',
        type: 'PARTNER',
        owner: { connect: { id: user.id } },
        creator: { connect: { id: user.id } },
      },
    });
  }

  // Create sample contacts (idempotent)
  const c1 = await prisma.contact.findFirst({ where: { email: 'john@acme.com' } });
  if (!c1) await prisma.contact.create({ data: { name: 'John Doe', email: 'john@acme.com', accountId: account1.id } });

  const c2 = await prisma.contact.findFirst({ where: { email: 'jane@globex.com' } });
  if (!c2) await prisma.contact.create({ data: { name: 'Jane Smith', email: 'jane@globex.com', accountId: account2.id } });

  // Create sample deals
  const stage = await prisma.dealStage.findFirst({ where: { name: 'Akquise' } })
    || await prisma.dealStage.findFirst({ orderBy: { order: 'asc' } });
  if (!stage) throw new Error('No deal stages found');

  const d1 = await prisma.deal.findFirst({ where: { name: 'Big Sale' } });
  if (!d1) {
    await prisma.deal.create({
      data: { name: 'Big Sale', accountId: account1.id, stageId: stage.id, amount: 10000, currency: 'CHF', expectedCloseDate: new Date(), ownerUserId: admin.id, createdByUserId: admin.id },
    });
  }

  const d2 = await prisma.deal.findFirst({ where: { name: 'Renewal' } });
  if (!d2) {
    await prisma.deal.create({
      data: { name: 'Renewal', accountId: account2.id, stageId: stage.id, amount: 5000, currency: 'CHF', expectedCloseDate: new Date(), ownerUserId: user.id, createdByUserId: user.id },
    });
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
