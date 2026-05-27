import { Module, forwardRef } from '@nestjs/common';
import { ProjectRadicationModule } from '../project-radication/project-radication.module';
import { SubjectsModule } from '../subjects/subjects.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubjectEntity } from '../subjects/subject.entity';
import { InstitutionalWorkflowController } from './institutional-workflow.controller';
import { InstitutionalWorkflowService } from './institutional-workflow.service';
import { InstitutionalWorkflowSlaService } from './institutional-workflow-sla.service';
import { OperationalTransitionEntity } from './operational-transition.entity';
import { SubjectOperationalCheckEntity } from './subject-operational-check.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubjectEntity,
      SubjectOperationalCheckEntity,
      OperationalTransitionEntity,
    ]),
    AuthModule,
    AuditModule,
    NotificationsModule,
    MailModule,
    forwardRef(() => ProjectRadicationModule),
    forwardRef(() => SubjectsModule),
  ],
  controllers: [InstitutionalWorkflowController],
  providers: [InstitutionalWorkflowService, InstitutionalWorkflowSlaService],
  exports: [InstitutionalWorkflowService, InstitutionalWorkflowSlaService],
})
export class InstitutionalWorkflowModule {}
