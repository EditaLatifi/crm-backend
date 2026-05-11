import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { SupabaseStorageService } from './supabase-storage.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CommonModule, NotificationsModule],
  providers: [DocumentsService, SupabaseStorageService],
  controllers: [DocumentsController],
  exports: [SupabaseStorageService],
})
export class DocumentsModule {}
