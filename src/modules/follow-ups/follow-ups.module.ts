import { Module } from '@nestjs/common';
import { FollowUpsController } from './follow-ups.controller';
import { FollowUpsService } from './follow-ups.service';
import { CommonModule } from '../../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [CommonModule, NotificationsModule, EmailModule],
  controllers: [FollowUpsController],
  providers: [FollowUpsService],
  exports: [FollowUpsService],
})
export class FollowUpsModule {}
