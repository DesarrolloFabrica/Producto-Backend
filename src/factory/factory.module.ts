import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ObservationEntity } from '../observations/observation.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectsModule } from '../subjects/subjects.module';
import { SubjectEntity } from '../subjects/subject.entity';
import { FactoryDashboardController } from './factory-dashboard.controller';
import { FactoryDashboardService } from './factory-dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SubjectEntity, SemesterEntity, ObservationEntity, ProjectEntity]),
    AuthModule,
    SubjectsModule,
  ],
  controllers: [FactoryDashboardController],
  providers: [FactoryDashboardService],
  exports: [FactoryDashboardService],
})
export class FactoryModule {}
