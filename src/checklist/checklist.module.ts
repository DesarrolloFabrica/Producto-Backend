import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ChecklistController } from './checklist.controller';
import { ChecklistItemEntity } from './checklist-item.entity';
import { ChecklistService } from './checklist.service';
import { InstitutionalWorkflowModule } from '../institutional-workflow/institutional-workflow.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChecklistItemEntity]),
    AuthModule,
    AuditModule,
    forwardRef(() => ProjectsModule),
    WorkflowModule,
    InstitutionalWorkflowModule,
  ],
  controllers: [ChecklistController],
  providers: [ChecklistService],
  exports: [ChecklistService],
})
export class ChecklistModule {}
