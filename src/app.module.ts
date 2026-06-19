import './env';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { ChecklistModule } from './checklist/checklist.module';
import { ObservationsModule } from './observations/observations.module';
import { SubjectsModule } from './subjects/subjects.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FactoryModule } from './factory/factory.module';
import { InstitutionalWorkflowModule } from './institutional-workflow/institutional-workflow.module';
import { ProjectRadicationModule } from './project-radication/project-radication.module';
import { PlanningDashboardModule } from './planning-dashboard/planning-dashboard.module';
import { LmsDashboardModule } from './lms-dashboard/lms-dashboard.module';
import { AuditModule } from './audit/audit.module';
import { CatalogsModule } from './catalogs/catalogs.module';
import { EmailModule } from './email/email.module';
import { ReportingModule } from './reporting/reporting.module';
import { CDigitalUsersModule } from './c-digital-users/c-digital-users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    HealthModule,
    ...(process.env.DATABASE_URL
      ? [
          UsersModule,
          AuthModule,
          ProjectsModule,
          ChecklistModule,
          ObservationsModule,
          SubjectsModule,
          NotificationsModule,
          FactoryModule,
          InstitutionalWorkflowModule,
          ProjectRadicationModule,
          PlanningDashboardModule,
          LmsDashboardModule,
          AuditModule,
          CatalogsModule,
          EmailModule,
          ReportingModule,
          CDigitalUsersModule,
        ]
      : []),
  ],
})
export class AppModule {}
