import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { SupabaseStorageService } from './supabase-storage.service';

@Module({
  imports: [CommonModule],
  providers: [DocumentsService, SupabaseStorageService],
  controllers: [DocumentsController],
})
export class DocumentsModule {}
