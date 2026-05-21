import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditLogEntity } from './audit-log.entity';

export interface CreateAuditLogInput {
  entityType: string;
  entityId: string;
  action: AuditAction;
  userId: string;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
  ) {}

  async createLog(input: CreateAuditLogInput, manager?: EntityManager): Promise<AuditLogEntity> {
    const repo = manager ? manager.getRepository(AuditLogEntity) : this.auditRepo;
    const log = repo.create({
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      user: { id: input.userId },
      beforeJson: input.beforeJson ?? null,
      afterJson: input.afterJson ?? null,
    });
    return await repo.save(log);
  }
}
