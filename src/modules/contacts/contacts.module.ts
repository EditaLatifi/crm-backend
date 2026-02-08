import { Module } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { CommonModule } from '../../common/common.module';
import { ActivityLoggerService } from '../activity/activity-logger.service';

@Module({
  imports: [CommonModule],
  providers: [ContactsService, ActivityLoggerService],
  controllers: [ContactsController],
  exports: [ContactsService],
})
export class ContactsModule {}
