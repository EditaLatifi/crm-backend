import { Module, forwardRef } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { DueDateCron } from './due-date.cron';
import { CommonModule } from '../../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CommonModule, forwardRef(() => NotificationsModule)],
  controllers: [EmailController],
  providers: [EmailService, DueDateCron],
  exports: [EmailService],
})
export class EmailModule {}
