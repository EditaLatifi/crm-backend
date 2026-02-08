import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "Comment" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    taskId UUID REFERENCES "Task"(id) ON DELETE CASCADE,
    authorId UUID REFERENCES "User"(id),
    text TEXT NOT NULL,
    createdAt TIMESTAMP DEFAULT now()
  )`;

  await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "TaskHistory" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    taskId UUID REFERENCES "Task"(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    payload JSONB,
    createdAt TIMESTAMP DEFAULT now(),
    userId UUID REFERENCES "User"(id)
  )`;
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
