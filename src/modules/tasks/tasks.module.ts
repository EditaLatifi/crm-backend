import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { CommonModule } from '../../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentsModule } from '../documents/documents.module';
import { EmailModule } from '../email/email.module';
import { TimeTrackingModule } from '../time-tracking/time-tracking.module';

@Module({
  imports: [CommonModule, NotificationsModule, DocumentsModule, EmailModule, TimeTrackingModule],
  providers: [TasksService],
  controllers: [TasksController],
  exports: [TasksService],
})
export class TasksModule {}
