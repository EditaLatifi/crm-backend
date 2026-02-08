import { Module } from '@nestjs/common';
import { TimeTrackingService } from './time-tracking.service';
import { TimeTrackingController } from './time-tracking.controller';
import { CommonModule } from '../../common/common.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [CommonModule, ActivityModule],
  providers: [TimeTrackingService],
  controllers: [TimeTrackingController],
  exports: [TimeTrackingService],
})
export class TimeTrackingModule {}
