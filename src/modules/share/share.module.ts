import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { ShareService } from './share.service';
import { ShareController } from './share.controller';

@Module({
  imports: [CommonModule],
  providers: [ShareService],
  controllers: [ShareController],
})
export class ShareModule {}
