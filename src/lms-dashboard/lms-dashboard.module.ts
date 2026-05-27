import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { InstitutionalWorkflowModule } from '../institutional-workflow/institutional-workflow.module';
import { OperationalTransitionEntity } from '../institutional-workflow/operational-transition.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { LmsDashboardController } from './lms-dashboard.controller';
import { LmsDashboardService } from './lms-dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SubjectEntity, ProjectEntity, OperationalTransitionEntity]),
    AuthModule,
    InstitutionalWorkflowModule,
  ],
  controllers: [LmsDashboardController],
  providers: [LmsDashboardService],
  exports: [LmsDashboardService],
})
export class LmsDashboardModule {}
