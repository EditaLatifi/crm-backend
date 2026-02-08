import { Module } from '@nestjs/common';
import { DealsService } from './deals.service';
import { DealsController } from './deals.controller';
import { CommonModule } from '../../common/common.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [CommonModule, ActivityModule],
  providers: [DealsService],
  controllers: [DealsController],
  exports: [DealsService],
})
export class DealsModule {}
