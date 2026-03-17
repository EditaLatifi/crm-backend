import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { CommonModule } from '../../common/common.module';
import { ActivityModule } from '../activity/activity.module';
import { ActivityLoggerService } from '../activity/activity-logger.service';

@Module({
  imports: [CommonModule, ActivityModule],
  providers: [AccountsService, ActivityLoggerService],
  controllers: [AccountsController],
  exports: [AccountsService],
})
export class AccountsModule {}
