/**
 * DEPRECATED: Anonymous user is no longer created.
 * This script now deactivates the anonymous user if it exists,
 * reassigning its display name to 'System' so existing references
 * remain valid without showing 'Anonymous' in the UI.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'anonymous@crm.local';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { name: 'System' },
    });
    console.log('Anonymous user renamed to "System".');
  } else {
    console.log('No anonymous user found — nothing to do.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
