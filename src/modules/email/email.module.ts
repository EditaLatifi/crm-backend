import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { DueDateCron } from './due-date.cron';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [CommonModule],
  providers: [EmailService, DueDateCron],
  exports: [EmailService],
})
export class EmailModule {}
