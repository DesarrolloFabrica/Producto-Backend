import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { ObservationsModule } from '../observations/observations.module';
import { ProjectEntity } from '../projects/project.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { ProgressService } from './progress.service';
import { ProjectWorkflowService } from './project-workflow.service';
import { SemesterWorkflowService } from './semester-workflow.service';
import { SubjectWorkflowService } from './subject-workflow.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChecklistItemEntity,
      SubjectEntity,
      ProjectEntity,
      SemesterEntity,
    ]),
    AuditModule,
    forwardRef(() => ObservationsModule),
  ],
  providers: [
    ProgressService,
    SubjectWorkflowService,
    SemesterWorkflowService,
    ProjectWorkflowService,
  ],
  exports: [
    ProgressService,
    SubjectWorkflowService,
    SemesterWorkflowService,
    ProjectWorkflowService,
  ],
})
export class WorkflowModule {}
