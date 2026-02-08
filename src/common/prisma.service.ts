import { Injectable, OnModuleInit, INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit {

  async onModuleInit() {
    let retries = 5;
    while (retries) {
      try {
        await this.$connect();
        break;
      } catch (err) {
        retries -= 1;
        console.log(`Prisma connection failed, retrying (${5 - retries}/5)...`);
        await new Promise(res => setTimeout(res, 5000)); // wait 5 seconds
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
