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
        ]
      : []),
  ],
})
export class AppModule {}
