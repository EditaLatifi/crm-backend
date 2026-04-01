import { Module } from '@nestjs/common';
import { DealsService } from './deals.service';
import { DealsController } from './deals.controller';
import { CommonModule } from '../../common/common.module';
import { ActivityModule } from '../activity/activity.module';
import { ActivityLoggerService } from '../activity/activity-logger.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [CommonModule, ActivityModule, NotificationsModule, DocumentsModule],
  providers: [DealsService, ActivityLoggerService],
  controllers: [DealsController],
  exports: [DealsService],
})
export class DealsModule {}
