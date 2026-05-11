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
import { ProjectsModule } from './modules/projects/projects.module';
import { PermitsModule } from './modules/permits/permits.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { BudgetModule } from './modules/budget/budget.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ShareModule } from './modules/share/share.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { FollowUpsModule } from './modules/follow-ups/follow-ups.module';
import { HealthController } from './health.controller';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { EmailModule } from './modules/email/email.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    ScheduleModule.forRoot(),
    CommonModule,
    EmailModule,
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
    ProjectsModule,
    PermitsModule,
    VendorsModule,
    BudgetModule,
    DocumentsModule,
    ShareModule,
    NotificationsModule,
    FollowUpsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
