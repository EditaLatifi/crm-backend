import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { PermitsService } from './permits.service';
import { PermitsController } from './permits.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CommonModule, NotificationsModule],
  providers: [PermitsService],
  controllers: [PermitsController],
})
export class PermitsModule {}
