import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { ProjectEntity } from '../projects/project.entity';
import { ProjectsModule } from '../projects/projects.module';
import { MailModule } from '../mail/mail.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ObservationsModule } from '../observations/observations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubjectEntity } from './subject.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { TopicEntity } from '../topics/topic.entity';
import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';
import { InstitutionalWorkflowModule } from '../institutional-workflow/institutional-workflow.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SubjectEntity, ChecklistItemEntity, ProjectEntity, SemesterEntity, TopicEntity]),
    AuthModule,
    AuditModule,
    forwardRef(() => ProjectsModule),
    WorkflowModule,
    forwardRef(() => ObservationsModule),
    NotificationsModule,
    MailModule,
    forwardRef(() => InstitutionalWorkflowModule),
  ],
  controllers: [SubjectsController],
  providers: [SubjectsService],
  exports: [SubjectsService],
})
export class SubjectsModule {}
