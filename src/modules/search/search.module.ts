import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [CommonModule],
  controllers: [SearchController],
})
export class SearchModule {}
