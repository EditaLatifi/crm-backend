import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';

@Module({
  imports: [CommonModule],
  providers: [VendorsService],
  controllers: [VendorsController],
})
export class VendorsModule {}
