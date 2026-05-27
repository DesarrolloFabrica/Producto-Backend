import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { InstitutionalWorkflowModule } from '../institutional-workflow/institutional-workflow.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ObservationsModule } from '../observations/observations.module';
import { ProjectEntity } from '../projects/project.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { ProjectInstitutionalWorkflowService } from './project-institutional-workflow.service';
import { ProjectOperationalTransitionEntity } from './project-operational-transition.entity';
import { ProjectRadicationController } from './project-radication.controller';
import { ProjectRadicationEntity } from './project-radication.entity';
import { ProjectRadicationReadinessService } from './project-radication-readiness.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      SemesterEntity,
      SubjectEntity,
      ProjectRadicationEntity,
      ProjectOperationalTransitionEntity,
    ]),
    AuthModule,
    AuditModule,
    NotificationsModule,
    MailModule,
    forwardRef(() => ObservationsModule),
    forwardRef(() => InstitutionalWorkflowModule),
  ],
  controllers: [ProjectRadicationController],
  providers: [ProjectRadicationReadinessService, ProjectInstitutionalWorkflowService],
  exports: [ProjectRadicationReadinessService, ProjectInstitutionalWorkflowService],
})
export class ProjectRadicationModule {}
