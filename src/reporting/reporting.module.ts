import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { AuditLogEntity } from '../audit/audit-log.entity';
import { InstitutionalWorkflowModule } from '../institutional-workflow/institutional-workflow.module';
import { SemesterOperationalTransitionEntity } from '../institutional-workflow/semester-operational-transition.entity';
import { ObservationEntity } from '../observations/observation.entity';
import { ProjectRadicationEntity } from '../project-radication/project-radication.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { ReportingCatalogService } from './reporting-catalog.service';
import { ReportingController } from './reporting.controller';
import { ReportingExportService } from './reporting-export.service';
import { ReportingFilterOptionsService } from './reporting-filter-options.service';
import { ReportingPolicyService } from './reporting-policy.service';
import { ReportingQueryService } from './reporting-query.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      SemesterEntity,
      SubjectEntity,
      ObservationEntity,
      ProjectRadicationEntity,
      AuditLogEntity,
      SemesterOperationalTransitionEntity,
    ]),
    AuthModule,
    AuditModule,
    InstitutionalWorkflowModule,
  ],
  controllers: [ReportingController],
  providers: [
    ReportingCatalogService,
    ReportingPolicyService,
    ReportingQueryService,
    ReportingExportService,
    ReportingFilterOptionsService,
  ],
  exports: [ReportingQueryService, ReportingPolicyService, ReportingFilterOptionsService],
})
export class ReportingModule {}
