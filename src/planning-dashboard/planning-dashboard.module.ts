import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { InstitutionalWorkflowModule } from '../institutional-workflow/institutional-workflow.module';
import { OperationalTransitionEntity } from '../institutional-workflow/operational-transition.entity';
import { ProjectOperationalTransitionEntity } from '../project-radication/project-operational-transition.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { PlanningDashboardController } from './planning-dashboard.controller';
import { PlanningDashboardService } from './planning-dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubjectEntity,
      SemesterEntity,
      ProjectEntity,
      OperationalTransitionEntity,
      ProjectOperationalTransitionEntity,
    ]),
    AuthModule,
    InstitutionalWorkflowModule,
  ],
  controllers: [PlanningDashboardController],
  providers: [PlanningDashboardService],
  exports: [PlanningDashboardService],
})
export class PlanningDashboardModule {}
