import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ProjectEntity } from '../projects/project.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { TopicEntity } from '../topics/topic.entity';
import { AuditController } from './audit.controller';
import { AuditLogEntity } from './audit-log.entity';
import { AuditService } from './audit.service';
import { StatusHistoryEntity } from './status-history.entity';
import { StatusHistoryService } from './status-history.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AuditLogEntity,
      StatusHistoryEntity,
      ProjectEntity,
      SubjectEntity,
      SemesterEntity,
      TopicEntity,
    ]),
    AuthModule,
  ],
  controllers: [AuditController],
  providers: [AuditService, StatusHistoryService],
  exports: [AuditService, StatusHistoryService, TypeOrmModule],
})
export class AuditModule {}
