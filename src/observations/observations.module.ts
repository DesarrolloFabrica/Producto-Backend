import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { ProjectEntity } from '../projects/project.entity';
import { ProjectsModule } from '../projects/projects.module';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { TopicEntity } from '../topics/topic.entity';
import { WorkflowModule } from '../workflow/workflow.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ObservationMessageEntity } from './observation-message.entity';
import { ObservationEntity } from './observation.entity';
import { ObservationsController } from './observations.controller';
import { ObservationsService } from './observations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ObservationEntity,
      ObservationMessageEntity,
      ProjectEntity,
      SubjectEntity,
      TopicEntity,
      ChecklistItemEntity,
      SemesterEntity,
    ]),
    AuthModule,
    AuditModule,
    forwardRef(() => ProjectsModule),
    forwardRef(() => WorkflowModule),
    NotificationsModule,
  ],
  controllers: [ObservationsController],
  providers: [ObservationsService],
  exports: [ObservationsService],
})
export class ObservationsModule {}
