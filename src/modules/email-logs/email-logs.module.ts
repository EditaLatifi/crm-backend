import { Module } from '@nestjs/common';
import { EmailLogsController } from './email-logs.controller';
import { EmailLogsService } from './email-logs.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [EmailLogsController],
  providers: [EmailLogsService, PrismaService],
})
export class EmailLogsModule {}
