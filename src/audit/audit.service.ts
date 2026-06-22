import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { ProjectEntity } from '../projects/project.entity';
import { ProjectChangeTimelineEntryDto } from '../projects/dto/project-change-tracking.dto';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { TopicEntity } from '../topics/topic.entity';
import { AuditLogEntity } from './audit-log.entity';
import {
  bulkApproveScopeLabel,
  checklistCategoryLabel,
  CHECKLIST_STATUS_LABELS,
  checklistStatusLabel,
  entityTypeLabel,
  institutionalStateLabel,
  roleLabel,
  subjectStatusLabel,
} from './audit-display.labels';
import { AuditLogDetailEntryDto, AuditLogListResponseDto, AuditLogResponseDto } from './dto/audit-log-response.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

export interface CreateAuditLogInput {
  entityType: string;
  entityId: string;
  action: AuditAction;
  userId: string;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
}

interface AuditEntityContext {
  projectId?: string;
  subjectId?: string;
  semesterId?: string;
  program?: string;
  school?: string;
  semesterNumber?: number;
  subjectName?: string;
  scopeName?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(SemesterEntity)
    private readonly semesterRepo: Repository<SemesterEntity>,
    @InjectRepository(TopicEntity)
    private readonly topicRepo: Repository<TopicEntity>,
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

  async findLogs(query: AuditLogQueryDto = {}): Promise<AuditLogListResponseDto> {
    const pageSize = query.limit ?? 10;
    const page = query.page ?? 1;
    const offset = (page - 1) * pageSize;

    const qb = this.auditRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .orderBy('log.createdAt', 'DESC')
      .skip(offset)
      .take(pageSize + 1);

    this.applyLogFilters(qb, query);

    const [logs, total, stats] = await Promise.all([
      qb.getMany(),
      this.buildLogsCountQuery(query).getCount(),
      this.buildStats(query),
    ]);

    const hasMore = logs.length > pageSize;
    const pageLogs = logs.slice(0, pageSize);
    const contexts = await this.resolveContexts(pageLogs);
    const items = pageLogs.map((log) => this.toAdminDto(log, contexts));

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      items,
      hasMore,
      total,
      stats,
      page,
      pageSize,
      totalPages,
    };
  }

  private applyLogFilters(
    qb: ReturnType<Repository<AuditLogEntity>['createQueryBuilder']>,
    query: AuditLogQueryDto,
  ) {
    const entityTypes = this.resolveEntityTypes(query);
    if (entityTypes.length === 1) {
      qb.andWhere('log.entityType = :entityType', { entityType: entityTypes[0] });
    } else if (entityTypes.length > 1) {
      qb.andWhere('log.entityType IN (:...entityTypes)', { entityTypes });
    }
    if (query.action) {
      qb.andWhere('log.action = :action', { action: query.action });
    }
    if (query.role) {
      qb.andWhere('user.role = :role', { role: query.role });
    }
  }

  private resolveEntityTypes(query: AuditLogQueryDto): string[] {
    if (query.entityTypes?.trim()) {
      return query.entityTypes
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    }
    if (query.entityType?.trim()) {
      return [query.entityType.trim()];
    }
    return [];
  }

  private buildLogsCountQuery(query: AuditLogQueryDto) {
    const qb = this.auditRepo.createQueryBuilder('log').leftJoin('log.user', 'user');
    this.applyLogFilters(qb, query);
    return qb;
  }

  private async buildStats(query: AuditLogQueryDto) {
    const base = () => this.buildLogsCountQuery(query);
    const [total, productCount, factoryCount, checklistCount] = await Promise.all([
      base().getCount(),
      base().andWhere('user.role = :role', { role: UserRole.PRODUCT }).getCount(),
      base().andWhere('user.role = :role', { role: UserRole.FABRICA }).getCount(),
      base()
        .andWhere('log.entityType IN (:...types)', { types: ['CHECKLIST_ITEM', 'SUBJECT'] })
        .andWhere('log.action IN (:...actions)', {
          actions: [AuditAction.CHECKLIST_UPDATE, AuditAction.CHECKLIST_SECTION_BULK_APPROVED],
        })
        .getCount(),
    ]);

    return { total, productCount, factoryCount, checklistCount };
  }

  private async resolveContexts(logs: AuditLogEntity[]): Promise<Map<string, AuditEntityContext>> {
    const projectIds = new Set<string>();
    const subjectIds = new Set<string>();
    const semesterIds = new Set<string>();
    const topicIds = new Set<string>();

    for (const log of logs) {
      const after = log.afterJson ?? {};
      const before = log.beforeJson ?? {};

      if (log.entityType === 'PROJECT') projectIds.add(log.entityId);
      if (log.entityType === 'SUBJECT') subjectIds.add(log.entityId);
      if (log.entityType === 'SEMESTER') semesterIds.add(log.entityId);
      if (log.entityType === 'TOPIC') topicIds.add(log.entityId);

      const projectId = this.pickString(after, 'projectId') ?? this.pickString(before, 'projectId');
      const subjectId = this.pickString(after, 'subjectId') ?? this.pickString(before, 'subjectId');
      if (projectId) projectIds.add(projectId);
      if (subjectId) subjectIds.add(subjectId);
    }

    const [projects, subjects, semesters, topics] = await Promise.all([
      projectIds.size
        ? this.projectRepo.find({ where: { id: In([...projectIds]) } })
        : Promise.resolve([]),
      subjectIds.size
        ? this.subjectRepo.find({
            where: { id: In([...subjectIds]) },
            relations: { project: true, semester: true },
          })
        : Promise.resolve([]),
      semesterIds.size
        ? this.semesterRepo.find({
            where: { id: In([...semesterIds]) },
            relations: { project: true },
          })
        : Promise.resolve([]),
      topicIds.size
        ? this.topicRepo.find({
            where: { id: In([...topicIds]) },
            relations: { subject: { project: true, semester: true } },
          })
        : Promise.resolve([]),
    ]);

    const contexts = new Map<string, AuditEntityContext>();

    for (const project of projects) {
      contexts.set(this.contextKey('PROJECT', project.id), {
        projectId: project.id,
        program: project.program,
        school: project.school,
        scopeName: project.program,
      });
    }

    for (const subject of subjects) {
      contexts.set(this.contextKey('SUBJECT', subject.id), {
        projectId: subject.project.id,
        subjectId: subject.id,
        semesterId: subject.semester.id,
        program: subject.project.program,
        school: subject.project.school,
        semesterNumber: subject.semester.semesterNumber,
        subjectName: subject.name,
        scopeName: subject.name,
      });
    }

    for (const semester of semesters) {
      contexts.set(this.contextKey('SEMESTER', semester.id), {
        projectId: semester.project.id,
        semesterId: semester.id,
        program: semester.project.program,
        school: semester.project.school,
        semesterNumber: semester.semesterNumber,
        scopeName: `Semestre ${semester.semesterNumber}`,
      });
    }

    for (const topic of topics) {
      contexts.set(this.contextKey('TOPIC', topic.id), {
        projectId: topic.subject.project.id,
        subjectId: topic.subject.id,
        semesterId: topic.subject.semester.id,
        program: topic.subject.project.program,
        school: topic.subject.project.school,
        semesterNumber: topic.subject.semester.semesterNumber,
        subjectName: topic.subject.name,
        scopeName: topic.name,
      });
    }

    return contexts;
  }

  private contextKey(entityType: string, entityId: string) {
    return `${entityType}:${entityId}`;
  }

  private resolveContextForLog(
    log: AuditLogEntity,
    contexts: Map<string, AuditEntityContext>,
  ): AuditEntityContext {
    const direct = contexts.get(this.contextKey(log.entityType, log.entityId));
    if (direct) return direct;

    const after = log.afterJson ?? {};
    const before = log.beforeJson ?? {};
    const projectId = this.pickString(after, 'projectId') ?? this.pickString(before, 'projectId');
    const subjectId = this.pickString(after, 'subjectId') ?? this.pickString(before, 'subjectId');

    if (subjectId) {
      const subjectContext = contexts.get(this.contextKey('SUBJECT', subjectId));
      if (subjectContext) return subjectContext;
    }
    if (projectId) {
      const projectContext = contexts.get(this.contextKey('PROJECT', projectId));
      if (projectContext) return projectContext;
    }

    if (log.entityType === 'OBSERVATION' || log.entityType === 'OBSERVATION_BATCH') {
      return {
        projectId,
        subjectId,
        scopeName: log.entityType === 'OBSERVATION_BATCH' ? 'Lote de observaciones' : 'Observación',
        program: projectId ? contexts.get(this.contextKey('PROJECT', projectId))?.program : undefined,
        school: projectId ? contexts.get(this.contextKey('PROJECT', projectId))?.school : undefined,
      };
    }

    if (log.entityType === 'CHECKLIST_ITEM') {
      return { scopeName: 'Ítem de checklist' };
    }

    return {
      scopeName: entityTypeLabel(log.entityType),
    };
  }

  private toAdminDto(
    log: AuditLogEntity,
    contexts: Map<string, AuditEntityContext>,
  ): AuditLogResponseDto {
    const after = log.afterJson ?? {};
    const before = log.beforeJson ?? {};
    const context = this.resolveContextForLog(log, contexts);
    const { previousValue, newValue } = this.resolveChangeValues(log, before, after);
    const userRole = log.user?.role ?? UserRole.ADMIN;
    const scope = this.buildScope(log, context);
    const summary = this.buildSummary(log, before, after, context, previousValue, newValue);
    const changeLabel = this.buildChangeLabel(previousValue, newValue);
    const details = this.buildMovementDetails(log, before, after, context, {
      userName: log.user?.name ?? 'Usuario',
      role: userRole,
      previousValue,
      newValue,
      action: this.resolveActionLabel(log.action),
    });

    return {
      id: log.id,
      entityType: log.entityType,
      entityId: log.entityId,
      entityName: context.scopeName ?? this.resolveEntityName(log, before, after),
      action: this.resolveActionLabel(log.action),
      userName: log.user?.name ?? 'Usuario',
      role: userRole,
      roleLabel: roleLabel(userRole),
      entityTypeLabel: entityTypeLabel(log.entityType),
      previousValue,
      newValue,
      createdAt: log.createdAt.toISOString(),
      projectId:
        context.projectId ??
        (log.entityType === 'PROJECT' ? log.entityId : undefined),
      subjectId:
        context.subjectId ??
        (log.entityType === 'SUBJECT' ? log.entityId : undefined),
      semesterId: context.semesterId ?? (log.entityType === 'SEMESTER' ? log.entityId : undefined),
      program: context.program,
      school: context.school,
      semesterNumber: context.semesterNumber,
      subjectName: context.subjectName,
      scope,
      summary,
      changeLabel,
      details,
    };
  }

  private buildChangeLabel(previousValue: string, newValue: string): string {
    if (previousValue === '—' && newValue === '—') return 'Sin cambio registrado';
    if (previousValue === '—') return newValue;
    if (newValue === '—') return previousValue;
    return `${previousValue} → ${newValue}`;
  }

  private buildMovementDetails(
    log: AuditLogEntity,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    context: AuditEntityContext,
    meta: {
      userName: string;
      role: UserRole;
      previousValue: string;
      newValue: string;
      action: string;
    },
  ): AuditLogDetailEntryDto[] {
    const entries: AuditLogDetailEntryDto[] = [];

    if (log.action === AuditAction.CHECKLIST_SECTION_BULK_APPROVED) {
      entries.push({
        label: 'Alcance de aprobación',
        value: bulkApproveScopeLabel(before.scope),
      });
      if (typeof before.category === 'string' && before.category) {
        entries.push({
          label: 'Categoría',
          value: checklistCategoryLabel(before.category),
        });
      }
      if (typeof after.countUpdated === 'number') {
        entries.push({
          label: 'Ítems aprobados',
          value: String(after.countUpdated),
        });
      }
    }

    if (typeof after.action === 'string' && after.action) {
      entries.push({ label: 'Operación del flujo', value: String(after.action) });
    }

    if (Array.isArray(after.topicNames) && after.topicNames.length > 0) {
      entries.push({
        label: 'Temas académicos',
        value: after.topicNames.filter((name): name is string => typeof name === 'string').join(', '),
      });
    }

    if (typeof after.changeReason === 'string' && after.changeReason.trim()) {
      entries.push({ label: 'Motivo del cambio', value: after.changeReason.trim() });
    }

    entries.push(
      { label: 'Valor anterior', value: meta.previousValue },
      { label: 'Valor nuevo', value: meta.newValue },
    );

    return entries;
  }

  private buildScope(log: AuditLogEntity, context: AuditEntityContext): string {
    if (context.subjectName && context.semesterNumber != null) {
      return `Sem. ${context.semesterNumber} · ${context.subjectName}`;
    }
    if (context.semesterNumber != null) {
      return `Semestre ${context.semesterNumber}`;
    }
    if (context.scopeName) return context.scopeName;
    return entityTypeLabel(log.entityType);
  }

  private buildSummary(
    log: AuditLogEntity,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    context: AuditEntityContext,
    previousValue: string,
    newValue: string,
  ): string {
    const program = context.program ? context.program : 'Programa';
    const scope = this.buildScope(log, context);
    const action = this.resolveActionLabel(log.action).toLowerCase();

    if (Array.isArray(after.topicNames)) {
      const count = after.topicNames.length;
      return `${program} · ${scope}: definió ${count} tema${count === 1 ? '' : 's'} académico${count === 1 ? '' : 's'}`;
    }

    if (log.action === AuditAction.STATUS_CHANGE) {
      return `${program} · ${scope}: ${action} de «${previousValue}» a «${newValue}»`;
    }

    if (log.action === AuditAction.CHECKLIST_UPDATE) {
      return `${program} · ${scope}: actualizó checklist (${previousValue} → ${newValue})`;
    }

    if (log.action === AuditAction.CHECKLIST_SECTION_BULK_APPROVED) {
      return `${program} · ${scope}: aprobó ítems de checklist (${newValue})`;
    }

    if (log.action === AuditAction.OBSERVATION_CREATE) {
      return `${program}: registró una observación operativa`;
    }

    if (log.action === AuditAction.CREATE && log.entityType === 'PROJECT') {
      return `Creó la solicitud del programa ${context.program ?? newValue}`;
    }

    if (log.action === AuditAction.UPDATE && typeof after.name === 'string') {
      return `${program} · ${scope}: renombró a «${after.name}»`;
    }

    return `${program} · ${scope}: ${action} (${previousValue} → ${newValue})`;
  }

  private resolveEntityName(
    log: AuditLogEntity,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): string {
    const candidates = [
      after.program,
      after.subjectName,
      after.name,
      after.title,
      after.text,
      before.program,
      before.subjectName,
      before.name,
      after.changeType,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    if (typeof after.semesterNumber === 'number') {
      return `Semestre ${after.semesterNumber}`;
    }

    if (log.entityType === 'OBSERVATION_BATCH') {
      return 'Lote de observaciones';
    }

    if (log.entityType === 'CHECKLIST_ITEM') {
      return 'Ítem de checklist';
    }

    return `${log.entityType} ${log.entityId.slice(0, 8)}`;
  }

  private resolveChangeValues(
    log: AuditLogEntity,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): { previousValue: string; newValue: string } {
    if (log.action === AuditAction.STATUS_CHANGE) {
      return {
        previousValue: institutionalStateLabel(before.operationalState ?? before.status),
        newValue: institutionalStateLabel(after.operationalState ?? after.status),
      };
    }

    if (log.action === AuditAction.CHECKLIST_UPDATE) {
      return {
        previousValue: checklistStatusLabel(before.status),
        newValue: checklistStatusLabel(after.status),
      };
    }

    if (log.action === AuditAction.CHECKLIST_SECTION_BULK_APPROVED) {
      const category =
        typeof before.category === 'string' && before.category
          ? checklistCategoryLabel(before.category)
          : bulkApproveScopeLabel(before.scope);
      const count = typeof after.countUpdated === 'number' ? after.countUpdated : 0;
      return {
        previousValue: category,
        newValue: `${count} ítem${count === 1 ? '' : 's'} aprobado${count === 1 ? '' : 's'}`,
      };
    }

    if (
      log.action === AuditAction.OBSERVATION_CREATE ||
      log.action === AuditAction.OBSERVATION_STATUS_CHANGE
    ) {
      return {
        previousValue: this.formatAuditValue(before.status ?? 'Sin observación'),
        newValue: this.formatAuditValue(after.status ?? after.text ?? 'Registrada'),
      };
    }

    if (log.action === AuditAction.CREATE) {
      const summary =
        this.pickString(after, 'program') ??
        this.pickString(after, 'subjectName') ??
        this.pickString(after, 'changeType') ??
        'Registro creado';
      return { previousValue: '—', newValue: summary };
    }

    if (log.action === AuditAction.UPDATE) {
      if (Array.isArray(after.topicNames)) {
        const count = after.topicNames.length;
        return {
          previousValue: 'Sin temas definidos',
          newValue: `${count} tema${count === 1 ? '' : 's'} académico${count === 1 ? '' : 's'}`,
        };
      }
      if (typeof after.name === 'string' || typeof before.name === 'string') {
        return {
          previousValue: this.formatAuditValue(before.name),
          newValue: this.formatAuditValue(after.name),
        };
      }
      const keys = ['program', 'status', 'operationalState', 'changeType'];
      for (const key of keys) {
        if (before[key] !== undefined || after[key] !== undefined) {
          const formatter =
            key === 'operationalState' || key === 'status'
              ? (value: unknown) =>
                  key === 'operationalState'
                    ? institutionalStateLabel(value)
                    : subjectStatusLabel(value)
              : this.formatAuditValue.bind(this);
          return {
            previousValue: formatter(before[key]),
            newValue: formatter(after[key]),
          };
        }
      }
    }

    if (before.operationalState || after.operationalState) {
      return {
        previousValue: institutionalStateLabel(before.operationalState),
        newValue: institutionalStateLabel(after.operationalState),
      };
    }

    if (before.status || after.status) {
      const isChecklistStatus =
        typeof before.status === 'string' &&
        CHECKLIST_STATUS_LABELS[before.status] !== undefined;
      return {
        previousValue: isChecklistStatus
          ? checklistStatusLabel(before.status)
          : subjectStatusLabel(before.status),
        newValue: isChecklistStatus
          ? checklistStatusLabel(after.status)
          : subjectStatusLabel(after.status),
      };
    }

    if (this.isPlainObject(before) || this.isPlainObject(after)) {
      return {
        previousValue: 'Registro previo',
        newValue: 'Registro actualizado',
      };
    }

    return {
      previousValue: this.formatAuditValue(before),
      newValue: this.formatAuditValue(after),
    };
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private resolveActionLabel(action: AuditAction): string {
    const labels: Record<AuditAction, string> = {
      [AuditAction.CREATE]: 'Creación',
      [AuditAction.UPDATE]: 'Actualización',
      [AuditAction.DELETE]: 'Eliminación',
      [AuditAction.STATUS_CHANGE]: 'Cambio de estado',
      [AuditAction.CHECKLIST_UPDATE]: 'Actualización de checklist',
      [AuditAction.CHECKLIST_SECTION_BULK_APPROVED]: 'Aprobación masiva de checklist',
      [AuditAction.OBSERVATION_CREATE]: 'Observación registrada',
      [AuditAction.OBSERVATION_STATUS_CHANGE]: 'Cambio de observación',
      [AuditAction.SUBMIT]: 'Envío',
      [AuditAction.APPROVE]: 'Aprobación',
      [AuditAction.REJECT]: 'Rechazo',
      [AuditAction.DELIVER]: 'Entrega',
      [AuditAction.CLOSE]: 'Cierre',
      [AuditAction.REPORT_EXPORT]: 'Exportación de reporte',
      [AuditAction.C_DIGITAL_PASSWORD_REVEALED]: 'Revelación de contraseña C Digital',
    };
    return labels[action] ?? action;
  }

  private formatAuditValue(value: unknown): string {
    if (value == null || value === '') return '—';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return '—';
    }
  }

  private pickString(source: Record<string, unknown>, key: string): string | undefined {
    const value = source[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
