import { Module } from '@nestjs/common';
import { VacationController } from './vacation.controller';
import { VacationService } from './vacation.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [VacationController],
  providers: [VacationService, PrismaService],
})
export class VacationModule {}
