import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { CommonModule } from '../../common/common.module';
import { ActivityModule } from '../activity/activity.module';
import { ActivityLoggerService } from '../activity/activity-logger.service';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CommonModule, ActivityModule, EmailModule, NotificationsModule],
  providers: [ProjectsService, ActivityLoggerService],
  controllers: [ProjectsController],
  exports: [ProjectsService],
})
export class ProjectsModule {}
