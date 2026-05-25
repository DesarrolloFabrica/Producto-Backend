import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { ProjectChangeTimelineEntryDto } from '../projects/dto/project-change-tracking.dto';
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

  async getProjectChangeTimeline(projectId: string): Promise<ProjectChangeTimelineEntryDto[]> {
    const logs = await this.auditRepo.find({
      where: {
        entityType: 'PROJECT',
        entityId: projectId,
        action: In([AuditAction.CREATE, AuditAction.UPDATE]),
      },
      order: { createdAt: 'ASC' },
    });

    const entries: ProjectChangeTimelineEntryDto[] = [];

    for (const log of logs) {
      const after = log.afterJson ?? {};
      if (log.action === AuditAction.CREATE) {
        entries.push({
          occurredAt: log.createdAt,
          kind: 'PROJECT_CREATED',
          label: 'Solicitud creada',
          actionUrl: `/projects/${projectId}`,
        });
        continue;
      }

      const changeType = after.changeType as string | undefined;
      if (changeType === 'SEMESTER_ADDED') {
        const semesterNumber =
          typeof after.semesterNumber === 'number' ? after.semesterNumber : null;
        entries.push({
          occurredAt: log.createdAt,
          kind: 'SEMESTER_ADDED',
          label: semesterNumber
            ? `Product agregó Semestre ${semesterNumber}`
            : 'Product agregó un semestre',
          semesterNumber,
          actionUrl:
            semesterNumber != null
              ? `/projects/${projectId}/semesters/${semesterNumber}`
              : `/projects/${projectId}`,
        });
      } else if (changeType === 'SUBJECT_ADDED') {
        const subjectName =
          typeof after.subjectName === 'string' ? after.subjectName : null;
        const semesterNumber =
          typeof after.semesterNumber === 'number' ? after.semesterNumber : null;
        const subjectId =
          typeof after.subjectId === 'string' ? after.subjectId : null;
        entries.push({
          occurredAt: log.createdAt,
          kind: 'SUBJECT_ADDED',
          label: subjectName
            ? `Product agregó ${subjectName}${semesterNumber != null ? ` al Semestre ${semesterNumber}` : ''}`
            : 'Product agregó una asignatura',
          semesterNumber,
          subjectName,
          subjectId,
          actionUrl: subjectId
            ? `/subjects/${subjectId}`
            : semesterNumber != null
              ? `/projects/${projectId}/semesters/${semesterNumber}`
              : `/projects/${projectId}`,
        });
      }
    }

    return entries;
  }
}
