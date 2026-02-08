import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'anonymous@crm.local';
  const name = 'Anonymous';
  const passwordHash = '';
  const role = 'USER' as Role;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: { email, name, passwordHash, role },
    });
    console.log('Anonymous user created.');
  } else {
    console.log('Anonymous user already exists.');
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
