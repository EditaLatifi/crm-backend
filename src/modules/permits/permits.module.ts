import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { PermitsService } from './permits.service';
import { PermitsController } from './permits.controller';

@Module({
  imports: [CommonModule],
  providers: [PermitsService],
  controllers: [PermitsController],
})
export class PermitsModule {}
