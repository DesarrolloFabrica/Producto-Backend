import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntity } from './audit-log.entity';
import { AuditService } from './audit.service';
import { StatusHistoryEntity } from './status-history.entity';
import { StatusHistoryService } from './status-history.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity, StatusHistoryEntity])],
  providers: [AuditService, StatusHistoryService],
  exports: [AuditService, StatusHistoryService, TypeOrmModule],
})
export class AuditModule {}
