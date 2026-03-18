import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { BudgetService } from './budget.service';
import { BudgetController, BudgetAlertsController } from './budget.controller';

@Module({
  imports: [CommonModule],
  providers: [BudgetService],
  controllers: [BudgetController, BudgetAlertsController],
})
export class BudgetModule {}
