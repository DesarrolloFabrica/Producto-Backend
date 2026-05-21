import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { ProjectEntity } from '../projects/project.entity';
import { ProjectsModule } from '../projects/projects.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ObservationsModule } from '../observations/observations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubjectEntity } from './subject.entity';
import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SubjectEntity, ChecklistItemEntity, ProjectEntity]),
    AuthModule,
    AuditModule,
    forwardRef(() => ProjectsModule),
    WorkflowModule,
    forwardRef(() => ObservationsModule),
    NotificationsModule,
  ],
  controllers: [SubjectsController],
  providers: [SubjectsService],
  exports: [SubjectsService],
})
export class SubjectsModule {}
