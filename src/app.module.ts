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
import { SearchModule } from './modules/search/search.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { EmailLogsModule } from './modules/email-logs/email-logs.module';
import { VacationModule } from './modules/vacation/vacation.module';
import { HealthController } from './health.controller';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    CommonModule,
    AuthModule,
    UsersModule,
    DealsModule,
    AccountsModule,
    ContactsModule,
    ActivityModule,
    TasksModule,
    TimeTrackingModule,
    SearchModule,
    ReportsModule,
    AppointmentsModule,
    EmailLogsModule,
    VacationModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
