import { TasksModule } from './modules/tasks/tasks.module';
import { TimeTrackingModule } from './modules/time-tracking/time-tracking.module';
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CommonModule } from './common/common.module';
import { DealsModule } from './modules/deals/deals.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ActivityModule } from './modules/activity/activity.module';

@Module({
  imports: [
    CommonModule,
    AuthModule,
    UsersModule,
    DealsModule,
    AccountsModule,
    ContactsModule,
    ActivityModule,
    TasksModule,
    TimeTrackingModule,
    // ...other modules
  ],
})
export class AppModule {}
