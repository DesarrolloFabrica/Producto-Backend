import { Module, forwardRef } from '@nestjs/common';
import { ProjectRadicationModule } from '../project-radication/project-radication.module';
import { SubjectsModule } from '../subjects/subjects.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubjectEntity } from '../subjects/subject.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { ObservationsModule } from '../observations/observations.module';
import { InstitutionalWorkflowController } from './institutional-workflow.controller';
import { InstitutionalWorkflowService } from './institutional-workflow.service';
import { InstitutionalWorkflowSlaService } from './institutional-workflow-sla.service';
import { OperationalTransitionEntity } from './operational-transition.entity';
import { SemesterOperationalCheckEntity } from './semester-operational-check.entity';
import { SemesterOperationalTransitionEntity } from './semester-operational-transition.entity';
import { SemesterOperationalWorkflowService } from './semester-operational-workflow.service';
import { SubjectOperationalCheckEntity } from './subject-operational-check.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubjectEntity,
      SemesterEntity,
      SubjectOperationalCheckEntity,
      OperationalTransitionEntity,
      SemesterOperationalCheckEntity,
      SemesterOperationalTransitionEntity,
    ]),
    AuthModule,
    AuditModule,
    NotificationsModule,
    MailModule,
    forwardRef(() => ObservationsModule),
    forwardRef(() => ProjectRadicationModule),
    forwardRef(() => SubjectsModule),
  ],
  controllers: [InstitutionalWorkflowController],
  providers: [
    InstitutionalWorkflowService,
    SemesterOperationalWorkflowService,
    InstitutionalWorkflowSlaService,
  ],
  exports: [
    InstitutionalWorkflowService,
    SemesterOperationalWorkflowService,
    InstitutionalWorkflowSlaService,
  ],
})
export class InstitutionalWorkflowModule {}
