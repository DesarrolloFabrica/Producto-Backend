import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { ChecklistModule } from '../checklist/checklist.module';
import { ObservationsModule } from '../observations/observations.module';
import { SemestersModule } from '../semesters/semesters.module';
import { SubjectsModule } from '../subjects/subjects.module';
import { TopicsModule } from '../topics/topics.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { SubjectEntity } from '../subjects/subject.entity';
import { LinkResourceEntity } from './link-resource.entity';
import { ProjectEntity } from './project.entity';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { InstitutionalWorkflowModule } from '../institutional-workflow/institutional-workflow.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      LinkResourceEntity,
      ChecklistItemEntity,
      SubjectEntity,
    ]),
    UsersModule,
    AuthModule,
    AuditModule,
    forwardRef(() => SemestersModule),
    forwardRef(() => SubjectsModule),
    forwardRef(() => TopicsModule),
    forwardRef(() => ChecklistModule),
    forwardRef(() => ObservationsModule),
    WorkflowModule,
    NotificationsModule,
    MailModule,
    InstitutionalWorkflowModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
