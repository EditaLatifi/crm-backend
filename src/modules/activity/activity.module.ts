import { Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { ActivityLoggerService } from './activity-logger.service';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [CommonModule],
  providers: [ActivityService, ActivityLoggerService],
  controllers: [ActivityController],
  exports: [ActivityService, ActivityLoggerService],
})
export class ActivityModule {}
