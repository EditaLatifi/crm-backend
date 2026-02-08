import { Module } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { CommonModule } from '../../common/common.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [CommonModule, ActivityModule],
  providers: [AccountsService],
  controllers: [AccountsController],
  exports: [AccountsService],
})
export class AccountsModule {}
