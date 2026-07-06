// One-off: remove the "Qualifiziert" and "Verhandlung" deal stages.
// Deals + history referencing them are moved to "Angebot"; remaining stages are renumbered.
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const stages = await p.dealStage.findMany();
  const byName = Object.fromEntries(stages.map((s) => [s.name, s]));
  const angebot = byName['Angebot'];
  if (!angebot) throw new Error('Stage "Angebot" not found — aborting.');
  const remove = ['Qualifiziert', 'Verhandlung'].map((n) => byName[n]).filter(Boolean);
  const removeIds = remove.map((s) => s.id);
  if (removeIds.length === 0) { console.log('Nothing to remove (stages already gone).'); await p.$disconnect(); return; }
  console.log('Angebot:', angebot.id);
  console.log('Removing:', remove.map((s) => s.name).join(', '));

  const dealsBefore = await p.deal.count({ where: { stageId: { in: removeIds } } });
  const moved = await p.deal.updateMany({ where: { stageId: { in: removeIds } }, data: { stageId: angebot.id } });
  const hTo = await p.dealStageHistory.updateMany({ where: { toStageId: { in: removeIds } }, data: { toStageId: angebot.id } });
  const hFrom = await p.dealStageHistory.updateMany({ where: { fromStageId: { in: removeIds } }, data: { fromStageId: angebot.id } });
  const del = await p.dealStage.deleteMany({ where: { id: { in: removeIds } } });

  const order = { Akquise: 1, Angebot: 2, Gewonnen: 3, Verloren: 4 };
  for (const s of await p.dealStage.findMany()) {
    if (order[s.name] && s.order !== order[s.name]) await p.dealStage.update({ where: { id: s.id }, data: { order: order[s.name] } });
  }

  console.log(`deals moved to Angebot: ${moved.count} (had ${dealsBefore}) | history repointed: to=${hTo.count} from=${hFrom.count} | stages deleted: ${del.count}`);
  const final = await p.dealStage.findMany({ orderBy: { order: 'asc' } });
  console.log('Final pipeline:', final.map((s) => `${s.order}:${s.name}`).join('  ·  '));
  await p.$disconnect();
})().catch(async (e) => { console.error('FAILED:', e.message); await p.$disconnect(); process.exit(1); });
