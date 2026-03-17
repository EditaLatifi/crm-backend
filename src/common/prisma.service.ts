import { Injectable, OnModuleInit, INestApplication, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit {

  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      // Keep connections warm — avoids cold connection latency on every request
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit() {
    const maxRetries = 5;
    let retries = maxRetries;
    while (retries) {
      try {
        await this.$connect();
        this.logger.log('Database connected');
        break;
      } catch (err) {
        retries -= 1;
        this.logger.warn(`DB connection failed, retrying (${maxRetries - retries}/${maxRetries})...`);
        await new Promise(res => setTimeout(res, 2000)); // reduced from 5s to 2s
      }
    }
    if (!retries) {
      throw new Error('Prisma could not connect after 5 retries');
    }
  }

  async enableShutdownHooks(app: INestApplication) {
    (this as any).$on('beforeExit', async () => {
      await app.close();
    });
  }
}
