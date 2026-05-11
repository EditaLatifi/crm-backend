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
    const maxRetries = 10;
    let retries = maxRetries;
    while (retries) {
      try {
        await this.$connect();
        this.logger.log('Database connected');
        return;
      } catch (err) {
        retries -= 1;
        this.logger.warn(`DB connection failed, retrying (${maxRetries - retries}/${maxRetries})...`);
        await new Promise(res => setTimeout(res, 3000));
      }
    }
    // Don't crash — let the app start and retry on first request
    this.logger.error('Prisma could not connect after retries, starting anyway...');
  }

  async enableShutdownHooks(app: INestApplication) {
    (this as any).$on('beforeExit', async () => {
      await app.close();
    });
  }
}
