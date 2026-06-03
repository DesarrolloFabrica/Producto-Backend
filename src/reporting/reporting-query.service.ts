import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { ObservationNotificationStatus } from '../common/enums/observation-notification-status.enum';
import { ObservationStatus } from '../common/enums/observation-status.enum';
import { SlaStatus } from '../common/enums/sla-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { AuditLogEntity } from '../audit/audit-log.entity';
import { entityTypeLabel, roleLabel } from '../audit/audit-display.labels';
import { InstitutionalWorkflowSlaService } from '../institutional-workflow/institutional-workflow-sla.service';
import { responsibleRoleForState } from '../institutional-workflow/institutional-workflow.transitions';
import { operationalStateStageBucket } from '../institutional-workflow/program-operational-aggregator';
import { isSemesterAcademicallyComplete } from '../institutional-workflow/institutional-workflow.transitions';
import { ObservationEntity } from '../observations/observation.entity';
import { isFactoryVisibleUnresolvedObservation } from '../observations/observation-visibility.rules';
import { ProjectRadicationEntity } from '../project-radication/project-radication.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { SemesterOperationalTransitionEntity } from '../institutional-workflow/semester-operational-transition.entity';
import { UserEntity } from '../users/user.entity';
import { ReportingQueryDto } from './dto/reporting-query.dto';
import { ReportColumnDto, ReportPreviewResponseDto } from './dto/reporting-response.dto';
import { ReportId } from './report-id.enum';
import { reportExportMaxRows, reportPreviewLimit } from './reporting.config';
import {
  factoryProductionStatusLabel,
  formatReportDate,
  formatReportDateTime,
  institutionalStateLabel,
  projectInstitutionalStateLabel,
  modalityLabel,
  observationStatusLabel,
  priorityLabel,
  projectStatusLabel,
  slaStatusLabel,
  stageBucketLabel,
  yesNo,
} from './reporting-labels.util';
import { ReportingPolicyService } from './reporting-policy.service';
import { isUserRole, parsePositiveInt } from './reporting-filter-validation.util';
import { FACTORY_VISIBLE_SEMESTER_STATES } from './reporting-scope.constants';

const SLA_SEVERITY: Record<SlaStatus, number> = {
  [SlaStatus.OVERDUE]: 5,
  [SlaStatus.AT_RISK]: 4,
  [SlaStatus.ON_TIME]: 3,
  [SlaStatus.FINALIZED_OVERDUE]: 2,
  [SlaStatus.FINALIZED_ON_TIME]: 1,
};

function worstSla(statuses: SlaStatus[]): SlaStatus {
  if (!statuses.length) return SlaStatus.ON_TIME;
  return statuses.reduce((w, c) =>
    (SLA_SEVERITY[c] ?? 0) > (SLA_SEVERITY[w] ?? 0) ? c : w,
  );
}

function parseDateFilter(value?: string): Date | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function filtersSnapshot(query: ReportingQueryDto): Record<string, unknown> {
  return { ...query };
}

@Injectable()
export class ReportingQueryService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(SemesterEntity)
    private readonly semesterRepo: Repository<SemesterEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(ObservationEntity)
    private readonly observationRepo: Repository<ObservationEntity>,
    @InjectRepository(ProjectRadicationEntity)
    private readonly radicationRepo: Repository<ProjectRadicationEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
    @InjectRepository(SemesterOperationalTransitionEntity)
    private readonly semesterTransitionRepo: Repository<SemesterOperationalTransitionEntity>,
    private readonly policy: ReportingPolicyService,
    private readonly slaService: InstitutionalWorkflowSlaService,
  ) {}

  async preview(
    reportId: ReportId,
    query: ReportingQueryDto,
    user: UserEntity,
  ): Promise<ReportPreviewResponseDto> {
    const limit = query.limit ?? reportPreviewLimit();
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;
    return this.runReport(reportId, query, user, limit, offset, false);
  }

  async exportData(
    reportId: ReportId,
    query: ReportingQueryDto,
    user: UserEntity,
  ): Promise<ReportPreviewResponseDto> {
    const max = reportExportMaxRows();
    return this.runReport(reportId, query, user, max, 0, true);
  }

  private async runReport(
    reportId: ReportId,
    query: ReportingQueryDto,
    user: UserEntity,
    limit: number,
    offset: number,
    isExport: boolean,
  ): Promise<ReportPreviewResponseDto> {
    switch (reportId) {
      case ReportId.REQUESTS_GENERAL:
        return this.requestsGeneral(query, user, limit, offset, isExport);
      case ReportId.FACTORY_PRODUCTION:
        return this.factoryProduction(query, user, limit, offset, isExport);
      case ReportId.OBSERVATIONS_CORRECTIONS:
        return this.observationsCorrections(query, user, limit, offset, isExport);
      case ReportId.RADICATIONS:
        return this.radications(query, user, limit, offset, isExport);
      case ReportId.SLA_COMPLIANCE:
        return this.slaCompliance(query, user, limit, offset, isExport);
      case ReportId.AUDIT_TRAIL:
        return this.auditTrail(query, user, limit, offset, isExport);
      case ReportId.PRODUCTIVITY_BY_USER:
        return this.productivityByUser(query, user, limit, offset, isExport);
      case ReportId.PRODUCTIVITY_BY_ROLE:
        return this.productivityByRole(query, user, limit, offset, isExport);
      default:
        return {
          reportId,
          generatedAt: new Date().toISOString(),
          filters: filtersSnapshot(query),
          columns: [],
          rows: [],
          total: 0,
          page: 1,
          limit,
        };
    }
  }

  async getExecutiveSlaSummary(
    query: ReportingQueryDto,
    user: UserEntity,
  ): Promise<{
    kpis: Record<string, number>;
    topPrograms: Record<string, unknown>[];
  }> {
    const full = await this.slaCompliance(
      { ...query, limit: reportExportMaxRows() },
      user,
      5000,
      0,
      true,
    );
    const rows = full.rows;
    const total = rows.length;
    const onTime = rows.filter((r) =>
      ['ON_TIME', 'FINALIZED_ON_TIME'].includes(String(r.slaStatus)),
    ).length;
    const overdue = rows.filter((r) =>
      ['OVERDUE', 'FINALIZED_OVERDUE'].includes(String(r.slaStatus)),
    ).length;
    const atRisk = rows.filter((r) => r.slaStatus === 'AT_RISK').length;

    const byProgram = new Map<string, { program: string; school: string; worst: SlaStatus }>();
    for (const row of rows) {
      const key = String(row.projectId);
      const sla = row.slaStatus as SlaStatus;
      const existing = byProgram.get(key);
      if (!existing || (SLA_SEVERITY[sla] ?? 0) > (SLA_SEVERITY[existing.worst] ?? 0)) {
        byProgram.set(key, {
          program: String(row.program),
          school: String(row.school),
          worst: sla,
        });
      }
    }
    const topPrograms = [...byProgram.entries()]
      .map(([projectId, v]) => ({
        projectId,
        program: v.program,
        school: v.school,
        slaStatus: v.worst,
        slaLabel: slaStatusLabel(v.worst),
      }))
      .sort((a, b) => (SLA_SEVERITY[b.slaStatus as SlaStatus] ?? 0) - (SLA_SEVERITY[a.slaStatus as SlaStatus] ?? 0))
      .slice(0, 10);

    return {
      kpis: {
        total,
        onTime,
        atRisk,
        overdue,
        onTimePercent: total ? Math.round((onTime / total) * 100) : 0,
      },
      topPrograms,
    };
  }

  async getRadicationPdfRow(
    projectId: string,
    user: UserEntity,
  ): Promise<Record<string, unknown> | null> {
    const qb = this.projectRepo
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.productOwner', 'productOwner')
      .leftJoin('project.radicatedBy', 'radicatedBy')
      .addSelect(['radicatedBy.id', 'radicatedBy.name'])
      .where('project.id = :projectId', { projectId });
    this.policy.applyProjectScope(qb, user);
    const project = await qb.getOne();
    if (!project) return null;
    return {
      projectId: project.id,
      school: project.school,
      program: project.program,
      productOwnerName: project.productOwner?.name ?? '—',
      institutionalState: projectInstitutionalStateLabel(project.institutionalState),
      readyForRadicationAt: formatReportDateTime(project.readyForRadicationAt),
      productRadicationDueAt: formatReportDateTime(project.productRadicationDueAt),
      radicationNumber: project.radicationNumber ?? '—',
      radicatedAt: formatReportDateTime(project.radicatedAt),
      radicatedByName: project.radicatedBy?.name ?? '—',
      radicationComment: project.radicationComment ?? '—',
      radicationEvidenceUrl: project.radicationEvidenceUrl ?? '—',
    };
  }

  private computeSemesterSla(semester: SemesterEntity): SlaStatus {
    return this.slaService.computeSlaStatus({
      state: semester.operationalState,
      stageEnteredAt: semester.operationalStageEnteredAt,
      stageDueAt: semester.operationalStageDueAt,
      finalizedAt: semester.operationalFinalizedAt,
    });
  }

  private async loadSemestersByProjectIds(
    projectIds: string[],
  ): Promise<Map<string, SemesterEntity[]>> {
    if (!projectIds.length) return new Map();
    const semesters = await this.semesterRepo
      .createQueryBuilder('semester')
      .where('semester.projectId IN (:...ids)', { ids: projectIds })
      .andWhere('semester.deletedAt IS NULL')
      .getMany();
    const map = new Map<string, SemesterEntity[]>();
    for (const s of semesters) {
      const list = map.get(s.projectId) ?? [];
      list.push(s);
      map.set(s.projectId, list);
    }
    return map;
  }

  private async countSubjectsByProject(
    projectIds: string[],
  ): Promise<Map<string, { total: number; ready: number }>> {
    if (!projectIds.length) return new Map();
    const rows = await this.subjectRepo
      .createQueryBuilder('subject')
      .select('subject.projectId', 'projectId')
      .addSelect('COUNT(subject.id)', 'total')
      .addSelect(
        `COUNT(subject.id) FILTER (WHERE subject.progress >= 100 OR subject.status IN ('APPROVED','DELIVERED'))`,
        'ready',
      )
      .where('subject.projectId IN (:...ids)', { ids: projectIds })
      .andWhere('subject.deletedAt IS NULL')
      .groupBy('subject.projectId')
      .getRawMany();
    return new Map(
      rows.map((r) => [
        r.projectId,
        { total: Number(r.total), ready: Number(r.ready) },
      ]),
    );
  }

  private applyProjectFilters(
    qb: SelectQueryBuilder<ProjectEntity>,
    query: ReportingQueryDto,
    dateField: 'createdAt' | 'updatedAt' = 'createdAt',
  ): void {
    const from = parseDateFilter(query.dateFrom);
    const to = parseDateFilter(query.dateTo);
    if (from) {
      qb.andWhere(`project.${dateField} >= :dateFrom`, { dateFrom: from });
    }
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      qb.andWhere(`project.${dateField} <= :dateTo`, { dateTo: end });
    }
    if (query.school && query.school !== 'all') {
      qb.andWhere('project.school = :school', { school: query.school });
    }
    if (query.modality && query.modality !== 'all') {
      qb.andWhere('project.modality = :modality', { modality: query.modality });
    }
    if (query.priority) {
      qb.andWhere('project.priority = :priority', { priority: query.priority });
    }
    if (query.projectStatus) {
      qb.andWhere('project.status = :projectStatus', { projectStatus: query.projectStatus });
    }
    if (query.institutionalState) {
      qb.andWhere('project.institutionalState = :institutionalState', {
        institutionalState: query.institutionalState,
      });
    }
    if (query.legacyWorkflow !== undefined) {
      qb.andWhere('project.legacyWorkflow = :legacyWorkflow', {
        legacyWorkflow: query.legacyWorkflow,
      });
    }
    if (query.productOwnerId) {
      qb.andWhere('project.productOwnerId = :productOwnerId', {
        productOwnerId: query.productOwnerId,
      });
    }
    if (query.factoryOwnerId) {
      qb.andWhere('project.factoryOwnerId = :factoryOwnerId', {
        factoryOwnerId: query.factoryOwnerId,
      });
    }
    if (query.projectId) {
      qb.andWhere('project.id = :projectId', { projectId: query.projectId });
    }
    if (query.query?.trim()) {
      const q = `%${query.query.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('LOWER(project.program) LIKE :q', { q })
            .orWhere('LOWER(project.school) LIKE :q', { q });
        }),
      );
    }
  }

  private async requestsGeneral(
    query: ReportingQueryDto,
    user: UserEntity,
    limit: number,
    offset: number,
    isExport: boolean,
  ): Promise<ReportPreviewResponseDto> {
    const columns: ReportColumnDto[] = [
      { key: 'projectId', label: 'ID Solicitud' },
      { key: 'school', label: 'Escuela' },
      { key: 'program', label: 'Programa' },
      { key: 'modality', label: 'Modalidad' },
      { key: 'requestType', label: 'Tipo solicitud' },
      { key: 'priority', label: 'Prioridad' },
      { key: 'status', label: 'Estado solicitud' },
      { key: 'institutionalState', label: 'Estado institucional' },
      { key: 'legacyWorkflow', label: 'Flujo legacy' },
      { key: 'progress', label: 'Progreso %' },
      { key: 'productOwnerName', label: 'Owner Product' },
      { key: 'factoryOwnerName', label: 'Owner Fábrica' },
      { key: 'smeStatus', label: 'SME estado' },
      { key: 'expectedDeliveryDate', label: 'Fecha entrega esperada' },
      { key: 'activatedAt', label: 'Fecha activación' },
      { key: 'semestersTotal', label: 'Semestres total' },
      { key: 'semestersCompleted', label: 'Semestres completados' },
      { key: 'subjectsTotal', label: 'Materias total' },
      { key: 'slaStatus', label: 'SLA programa' },
      { key: 'currentResponsibleRole', label: 'Responsable actual' },
      { key: 'radicationNumber', label: 'Nº radicación' },
      { key: 'radicatedAt', label: 'Fecha radicación' },
      { key: 'createdAt', label: 'Fecha creación' },
      { key: 'updatedAt', label: 'Última actualización' },
    ];

    const qb = this.projectRepo
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.productOwner', 'productOwner')
      .leftJoinAndSelect('project.factoryOwner', 'factoryOwner');
    this.policy.applyProjectScope(qb, user);
    this.applyProjectFilters(qb, query);

    const total = await qb.clone().getCount();
    qb.orderBy('project.createdAt', 'DESC').addOrderBy('project.program', 'ASC');
    if (!isExport) qb.skip(offset).take(limit);
    else qb.take(limit);

    const projects = await qb.getMany();
    const projectIds = projects.map((p) => p.id);
    const [semesterMap, subjectMap] = await Promise.all([
      this.loadSemestersByProjectIds(projectIds),
      this.countSubjectsByProject(projectIds),
    ]);

    let rows: Record<string, unknown>[] = projects.map((p) => {
      const semesters = semesterMap.get(p.id) ?? [];
      const slaStatuses = semesters.map((s) => this.computeSemesterSla(s));
      const worst = worstSla(slaStatuses);
      const completedSemesters = semesters.filter((s) =>
        isSemesterAcademicallyComplete(s.operationalState),
      ).length;
      const dominantState = semesters[0]?.operationalState;
      const subjects = subjectMap.get(p.id) ?? { total: 0, ready: 0 };

      return {
        projectId: p.id,
        school: p.school,
        program: p.program,
        modality: modalityLabel(p.modality),
        requestType: p.requestType,
        priority: priorityLabel(p.priority),
        status: projectStatusLabel(p.status),
        institutionalState: projectInstitutionalStateLabel(p.institutionalState),
        legacyWorkflow: yesNo(p.legacyWorkflow),
        progress: p.progress,
        productOwnerName: p.productOwner?.name ?? '—',
        factoryOwnerName: p.factoryOwner?.name ?? 'Sin asignar',
        smeStatus: p.subjectMatterExpertStatus,
        expectedDeliveryDate: formatReportDate(p.expectedDeliveryDate),
        activatedAt: formatReportDate(p.activatedAt),
        semestersTotal: semesters.length,
        semestersCompleted: completedSemesters,
        subjectsTotal: subjects.total,
        slaStatus: slaStatusLabel(worst),
        slaStatusRaw: worst,
        currentResponsibleRole: dominantState
          ? roleLabel(responsibleRoleForState(dominantState))
          : '—',
        radicationNumber: p.radicationNumber ?? '—',
        radicatedAt: formatReportDateTime(p.radicatedAt),
        createdAt: formatReportDateTime(p.createdAt),
        updatedAt: formatReportDateTime(p.updatedAt),
      };
    });

    if (query.slaStatus) {
      rows = rows.filter((r) => r.slaStatusRaw === query.slaStatus);
    }

    return {
      reportId: ReportId.REQUESTS_GENERAL,
      generatedAt: new Date().toISOString(),
      filters: filtersSnapshot(query),
      columns,
      rows,
      total: query.slaStatus ? rows.length : total,
      page: query.page ?? 1,
      limit,
    };
  }

  private async factoryProduction(
    query: ReportingQueryDto,
    user: UserEntity,
    limit: number,
    offset: number,
    isExport: boolean,
  ): Promise<ReportPreviewResponseDto> {
    const columns: ReportColumnDto[] = [
      { key: 'projectId', label: 'ID Programa' },
      { key: 'school', label: 'Escuela' },
      { key: 'program', label: 'Programa' },
      { key: 'semesterNumber', label: 'Semestre Nº' },
      { key: 'semesterId', label: 'ID Semestre' },
      { key: 'operationalState', label: 'Estado operativo' },
      { key: 'subjectsTotal', label: 'Materias total' },
      { key: 'subjectsReady', label: 'Materias listas' },
      { key: 'progressPercent', label: 'Progreso materias %' },
      { key: 'factoryOwnerName', label: 'Owner Fábrica' },
      { key: 'factoryExpectedDate', label: 'Fecha esperada Fábrica' },
      { key: 'stageEnteredAt', label: 'Ingreso a etapa' },
      { key: 'stageDueAt', label: 'Vence etapa' },
      { key: 'slaStatus', label: 'SLA' },
      { key: 'openObservations', label: 'Observaciones abiertas' },
      { key: 'correctionsInProgress', label: 'Correcciones en curso' },
      { key: 'lastReturnReason', label: 'Última devolución motivo' },
      { key: 'lastReturnAt', label: 'Última devolución fecha' },
      { key: 'createdFromChange', label: 'Creado por cambio' },
    ];

    const qb = this.semesterRepo
      .createQueryBuilder('semester')
      .innerJoin('semester.project', 'project')
      .leftJoinAndSelect('project.factoryOwner', 'factoryOwner')
      .where('semester.deletedAt IS NULL');
    this.policy.applyProjectScope(qb, user);
    this.policy.applySemesterScope(qb, user);

    if (user.role === UserRole.FABRICA) {
      qb.andWhere('semester.operationalState IN (:...factoryStates)', {
        factoryStates: FACTORY_VISIBLE_SEMESTER_STATES,
      });
    }

    const from = parseDateFilter(query.dateFrom);
    const to = parseDateFilter(query.dateTo);
    if (from) {
      qb.andWhere('semester.operationalStageEnteredAt >= :dateFrom', { dateFrom: from });
    }
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('semester.operationalStageEnteredAt <= :dateTo', { dateTo: end });
    }
    if (query.operationalState) {
      qb.andWhere('semester.operationalState = :operationalState', {
        operationalState: query.operationalState,
      });
    }
    if (query.school && query.school !== 'all') {
      qb.andWhere('project.school = :school', { school: query.school });
    }
    if (query.factoryOwnerId) {
      qb.andWhere('project.factoryOwnerId = :factoryOwnerId', {
        factoryOwnerId: query.factoryOwnerId,
      });
    }
    if (query.query?.trim()) {
      const q = `%${query.query.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('LOWER(project.program) LIKE :q', { q })
            .orWhere('LOWER(project.school) LIKE :q', { q });
        }),
      );
    }

    const total = await qb.clone().getCount();
    qb.orderBy('semester.operationalStageDueAt', 'ASC', 'NULLS LAST')
      .addOrderBy('semester.semesterNumber', 'ASC');
    if (!isExport) qb.skip(offset).take(limit);
    else qb.take(limit);

    const semesters = await qb.getMany();
    const semesterIds = semesters.map((s) => s.id);
    const projectIds = [...new Set(semesters.map((s) => s.projectId))];

    const subjectStats = await this.subjectRepo.manager.query(
      `
      SELECT s."semesterId",
        COUNT(s.id)::int AS total,
        COUNT(s.id) FILTER (WHERE s.progress >= 100 OR s.status IN ('APPROVED','DELIVERED'))::int AS ready
      FROM subjects s
      WHERE s."semesterId" = ANY($1::uuid[]) AND s."deletedAt" IS NULL
      GROUP BY s."semesterId"
      `,
      [semesterIds.length ? semesterIds : ['00000000-0000-0000-0000-000000000000']],
    );
    type SubjectSemesterStats = { semesterId: string; total: number; ready: number };
    const statsMap = new Map<string, { total: number; ready: number }>(
      (subjectStats as SubjectSemesterStats[]).map((r) => [
        r.semesterId,
        { total: Number(r.total), ready: Number(r.ready) },
      ]),
    );

    const obsStats = await this.observationRepo.manager.query(
      `
      SELECT s."semesterId",
        COUNT(o.id) FILTER (
          WHERE o.status = 'ABIERTA' AND o."notificationStatus" = 'SENT' AND o.role = 'PRODUCT'
        )::int AS open,
        COUNT(o.id) FILTER (WHERE o.status = 'EN_CORRECCION')::int AS correction
      FROM subjects s
      LEFT JOIN observations o ON o."subjectId" = s.id
      WHERE s."semesterId" = ANY($1::uuid[]) AND s."deletedAt" IS NULL
      GROUP BY s."semesterId"
      `,
      [semesterIds.length ? semesterIds : ['00000000-0000-0000-0000-000000000000']],
    );
    type ObsSemesterStats = { semesterId: string; open: number; correction: number };
    const obsMap = new Map<string, { open: number; correction: number }>(
      (obsStats as ObsSemesterStats[]).map((r) => [
        r.semesterId,
        { open: Number(r.open), correction: Number(r.correction) },
      ]),
    );

    const projects =
      projectIds.length > 0
        ? await this.projectRepo.find({
            where: { id: In(projectIds) },
            relations: { factoryOwner: true },
          })
        : [];
    const projectById = new Map(projects.map((p) => [p.id, p]));

    let rows: Record<string, unknown>[] = [];
    for (const sem of semesters) {
      const project = projectById.get(sem.projectId);
      if (!project) continue;
      const stats = statsMap.get(sem.id) ?? { total: 0, ready: 0 };
      const obs = obsMap.get(sem.id) ?? { open: 0, correction: 0 };
      const sla = this.computeSemesterSla(sem);
      const progressPercent =
        stats.total > 0 ? Math.round((stats.ready / stats.total) * 100) : 0;

      rows.push({
        projectId: project.id,
        school: project.school,
        program: project.program,
        semesterNumber: sem.semesterNumber,
        semesterId: sem.id,
        operationalState: institutionalStateLabel(sem.operationalState),
        subjectsTotal: stats.total,
        subjectsReady: stats.ready,
        progressPercent,
        factoryOwnerName: project.factoryOwner?.name ?? 'Sin asignar',
        factoryExpectedDate: formatReportDate(sem.factoryExpectedDate),
        stageEnteredAt: formatReportDateTime(sem.operationalStageEnteredAt),
        stageDueAt: formatReportDateTime(sem.operationalStageDueAt),
        slaStatus: slaStatusLabel(sla),
        slaStatusRaw: sla,
        openObservations: obs.open,
        correctionsInProgress: obs.correction,
        lastReturnReason: sem.lastReturnReason ?? '—',
        lastReturnAt: formatReportDateTime(sem.lastReturnAt),
        createdFromChange: yesNo(sem.createdFromChange),
      });
    }

    if (query.slaStatus) {
      rows = rows.filter((r) => r.slaStatusRaw === query.slaStatus);
    }

    return {
      reportId: ReportId.FACTORY_PRODUCTION,
      generatedAt: new Date().toISOString(),
      filters: filtersSnapshot(query),
      columns,
      rows,
      total: query.slaStatus ? rows.length : total,
      page: query.page ?? 1,
      limit,
    };
  }

  private async observationsCorrections(
    query: ReportingQueryDto,
    user: UserEntity,
    limit: number,
    offset: number,
    isExport: boolean,
  ): Promise<ReportPreviewResponseDto> {
    const columns: ReportColumnDto[] = [
      { key: 'observationId', label: 'ID Observación' },
      { key: 'school', label: 'Escuela' },
      { key: 'program', label: 'Programa' },
      { key: 'semesterNumber', label: 'Semestre' },
      { key: 'subjectName', label: 'Materia' },
      { key: 'deliverable', label: 'Tema / ítem' },
      { key: 'authorRole', label: 'Rol autor' },
      { key: 'authorName', label: 'Autor' },
      { key: 'status', label: 'Estado' },
      { key: 'priority', label: 'Prioridad' },
      { key: 'notificationStatus', label: 'Notificación' },
      { key: 'textSummary', label: 'Texto resumen' },
      { key: 'createdAt', label: 'Fecha creación' },
      { key: 'sentAt', label: 'Fecha envío' },
      { key: 'dueDate', label: 'Fecha vencimiento' },
      { key: 'resolvedAt', label: 'Fecha resolución' },
      { key: 'resolvedByName', label: 'Resuelto por' },
      { key: 'daysOpen', label: 'Días abierta' },
      { key: 'batchId', label: 'ID Lote' },
    ];

    const qb = this.observationRepo
      .createQueryBuilder('obs')
      .innerJoinAndSelect('obs.project', 'project')
      .leftJoinAndSelect('obs.subject', 'subject')
      .leftJoinAndSelect('subject.semester', 'semester')
      .leftJoinAndSelect('obs.topic', 'topic')
      .leftJoinAndSelect('obs.checklistItem', 'checklistItem')
      .leftJoinAndSelect('obs.author', 'author')
      .leftJoinAndSelect('obs.resolvedBy', 'resolvedBy');
    this.policy.applyProjectScope(qb, user);

    const from = parseDateFilter(query.dateFrom);
    const to = parseDateFilter(query.dateTo);
    if (from) qb.andWhere('obs.createdAt >= :dateFrom', { dateFrom: from });
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('obs.createdAt <= :dateTo', { dateTo: end });
    }
    if (query.status) qb.andWhere('obs.status = :status', { status: query.status });
    if (isUserRole(query.role)) qb.andWhere('obs.role = :obsRole', { obsRole: query.role });
    if (query.priority) qb.andWhere('obs.priority = :priority', { priority: query.priority });
    if (query.projectId) qb.andWhere('project.id = :projectId', { projectId: query.projectId });
    const semesterNumber = parsePositiveInt(query.semesterNumber);
    if (semesterNumber) {
      qb.andWhere('semester.semesterNumber = :semesterNumber', { semesterNumber });
    }
    if (query.onlyOpen) {
      qb.andWhere('obs.status != :resolved', { resolved: ObservationStatus.RESUELTA });
    }
    if (query.school && query.school !== 'all') {
      qb.andWhere('project.school = :school', { school: query.school });
    }
    if (query.query?.trim()) {
      const q = `%${query.query.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('LOWER(project.program) LIKE :q', { q })
            .orWhere('LOWER(obs.text) LIKE :q', { q });
        }),
      );
    }

    const total = await qb.clone().getCount();
    qb.orderBy('obs.createdAt', 'DESC');
    if (!isExport) qb.skip(offset).take(limit);
    else qb.take(limit);

    const observations = await qb.getMany();
    const now = Date.now();

    let rows: Record<string, unknown>[] = observations
      .filter((obs) => {
        if (user.role !== UserRole.FABRICA) return true;
        return isFactoryVisibleUnresolvedObservation(obs.status, obs.notificationStatus);
      })
      .map((obs) => {
        const endMs = obs.resolvedAt?.getTime() ?? now;
        const daysOpen = Math.max(
          0,
          Math.floor((endMs - obs.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
        );
        const deliverable =
          obs.topic?.name ?? obs.checklistItem?.label ?? obs.subject?.name ?? '—';

        return {
          observationId: obs.id,
          school: obs.project.school,
          program: obs.project.program,
          semesterNumber: obs.subject?.semester?.semesterNumber ?? '—',
          subjectName: obs.subject?.name ?? '—',
          deliverable,
          authorRole: roleLabel(obs.role),
          authorName: obs.author?.name ?? '—',
          status: observationStatusLabel(obs.status),
          priority: priorityLabel(obs.priority),
          notificationStatus: obs.notificationStatus,
          textSummary: obs.text.length > 200 ? `${obs.text.slice(0, 200)}…` : obs.text,
          createdAt: formatReportDateTime(obs.createdAt),
          sentAt: formatReportDateTime(obs.sentAt),
          dueDate: formatReportDate(obs.dueDate),
          resolvedAt: formatReportDateTime(obs.resolvedAt),
          resolvedByName: obs.resolvedBy?.name ?? '—',
          daysOpen,
          batchId: obs.notificationBatchId ?? '—',
        };
      });

    return {
      reportId: ReportId.OBSERVATIONS_CORRECTIONS,
      generatedAt: new Date().toISOString(),
      filters: filtersSnapshot(query),
      columns,
      rows,
      total,
      page: query.page ?? 1,
      limit,
    };
  }

  private async radications(
    query: ReportingQueryDto,
    user: UserEntity,
    limit: number,
    offset: number,
    isExport: boolean,
  ): Promise<ReportPreviewResponseDto> {
    const activeColumns: ReportColumnDto[] = [
      { key: 'projectId', label: 'ID Programa' },
      { key: 'school', label: 'Escuela' },
      { key: 'program', label: 'Programa' },
      { key: 'productOwnerName', label: 'Owner Product' },
      { key: 'institutionalState', label: 'Estado institucional' },
      { key: 'readyForRadicationAt', label: 'Listo para radicación' },
      { key: 'productRadicationDueAt', label: 'Vence radicación Product' },
      { key: 'planningRadicationCheckDueAt', label: 'Vence revisión Planeación' },
      { key: 'radicationNumber', label: 'Nº radicación actual' },
      { key: 'radicatedAt', label: 'Fecha radicación' },
      { key: 'radicatedByName', label: 'Radicado por' },
      { key: 'radicationComment', label: 'Comentario' },
      { key: 'radicationEvidenceUrl', label: 'URL evidencia' },
      { key: 'lastRadicationReturnReason', label: 'Última devolución motivo' },
      { key: 'lastRadicationReturnedAt', label: 'Última devolución fecha' },
    ];

    const historyColumns: ReportColumnDto[] = [
      { key: 'projectId', label: 'ID Programa' },
      { key: 'school', label: 'Escuela' },
      { key: 'program', label: 'Programa' },
      { key: 'radicationNumber', label: 'Nº radicación' },
      { key: 'radicatedAt', label: 'Fecha' },
      { key: 'status', label: 'Estado registro' },
      { key: 'registeredByName', label: 'Registrado por' },
      { key: 'returnReason', label: 'Motivo devolución' },
      { key: 'returnedAt', label: 'Fecha devolución' },
      { key: 'validatedAt', label: 'Fecha validación' },
    ];

    const qb = this.projectRepo
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.productOwner', 'productOwner')
      .leftJoinAndSelect('project.radicatedBy', 'radicatedBy');
    this.policy.applyProjectScope(qb, user);

    const from = parseDateFilter(query.dateFrom);
    const to = parseDateFilter(query.dateTo);
    if (from) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('project.radicatedAt >= :dateFrom', { dateFrom: from })
            .orWhere('project.readyForRadicationAt >= :dateFrom', { dateFrom: from });
        }),
      );
    }
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('project.radicatedAt <= :dateTo', { dateTo: end })
            .orWhere('project.readyForRadicationAt <= :dateTo', { dateTo: end });
        }),
      );
    }
    if (query.hasRadicationNumber === true) {
      qb.andWhere('project.radicationNumber IS NOT NULL');
    }
    if (query.hasRadicationNumber === false) {
      qb.andWhere('project.radicationNumber IS NULL');
    }
    if (query.projectId) {
      qb.andWhere('project.id = :projectId', { projectId: query.projectId });
    }
    this.applyProjectFilters(qb, query);

    const total = await qb.clone().getCount();
    qb.orderBy('project.readyForRadicationAt', 'DESC', 'NULLS LAST').addOrderBy(
      'project.radicatedAt',
      'DESC',
      'NULLS LAST',
    );
    if (!isExport) qb.skip(offset).take(limit);
    else qb.take(limit);

    const projects = await qb.getMany();
    const activeRows: Record<string, unknown>[] = projects.map((p) => ({
      projectId: p.id,
      school: p.school,
      program: p.program,
      productOwnerName: p.productOwner?.name ?? '—',
      institutionalState: projectInstitutionalStateLabel(p.institutionalState),
      readyForRadicationAt: formatReportDateTime(p.readyForRadicationAt),
      productRadicationDueAt: formatReportDateTime(p.productRadicationDueAt),
      planningRadicationCheckDueAt: formatReportDateTime(p.planningRadicationCheckDueAt),
      radicationNumber: p.radicationNumber ?? '—',
      radicatedAt: formatReportDateTime(p.radicatedAt),
      radicatedByName: p.radicatedBy?.name ?? '—',
      radicationComment: p.radicationComment ?? '—',
      radicationEvidenceUrl: p.radicationEvidenceUrl ?? '—',
      lastRadicationReturnReason: p.lastRadicationReturnReason ?? '—',
      lastRadicationReturnedAt: formatReportDateTime(p.lastRadicationReturnedAt),
    }));

    let historyRows: Record<string, unknown>[] = [];
    if (user.role === UserRole.ADMIN) {
      const histQb = this.radicationRepo
        .createQueryBuilder('rad')
        .innerJoinAndSelect('rad.project', 'project')
        .leftJoinAndSelect('rad.registeredBy', 'registeredBy')
        .where('project.deletedAt IS NULL');
      if (from) histQb.andWhere('rad.radicatedAt >= :dateFrom', { dateFrom: from });
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        histQb.andWhere('rad.radicatedAt <= :dateTo', { dateTo: end });
      }
      if (query.projectId) {
        histQb.andWhere('project.id = :projectId', { projectId: query.projectId });
      }
      histQb.orderBy('rad.radicatedAt', 'DESC').take(isExport ? limit : 500);
      const history = await histQb.getMany();
      historyRows = history.map((r) => ({
        projectId: r.project.id,
        school: r.project.school,
        program: r.project.program,
        radicationNumber: r.radicationNumber,
        radicatedAt: formatReportDateTime(r.radicatedAt),
        status: r.status,
        registeredByName: r.registeredBy?.name ?? '—',
        returnReason: r.returnReason ?? '—',
        returnedAt: formatReportDateTime(r.returnedAt),
        validatedAt: formatReportDateTime(r.validatedAt),
      }));
    }

    return {
      reportId: ReportId.RADICATIONS,
      generatedAt: new Date().toISOString(),
      filters: filtersSnapshot(query),
      columns: activeColumns,
      rows: activeRows,
      total,
      page: query.page ?? 1,
      limit,
      sheets: user.role === UserRole.ADMIN
        ? [
            { name: 'Activas', columns: activeColumns, rows: activeRows },
            { name: 'Historial', columns: historyColumns, rows: historyRows },
          ]
        : undefined,
    };
  }

  private async slaCompliance(
    query: ReportingQueryDto,
    user: UserEntity,
    limit: number,
    offset: number,
    isExport: boolean,
  ): Promise<ReportPreviewResponseDto> {
    const columns: ReportColumnDto[] = [
      { key: 'school', label: 'Escuela' },
      { key: 'program', label: 'Programa' },
      { key: 'projectId', label: 'ID Programa' },
      { key: 'semesterNumber', label: 'Semestre Nº' },
      { key: 'operationalState', label: 'Estado operativo' },
      { key: 'stageBucket', label: 'Bucket etapa' },
      { key: 'responsibleRole', label: 'Responsable rol' },
      { key: 'stageEnteredAt', label: 'Ingreso etapa' },
      { key: 'stageDueAt', label: 'Vence etapa' },
      { key: 'finalizedAt', label: 'Finalizado' },
      { key: 'slaStatus', label: 'SLA' },
      { key: 'daysInStage', label: 'Días en etapa' },
      { key: 'businessDaysAssigned', label: 'Días hábiles asignados' },
      { key: 'productOwnerName', label: 'Owner Product' },
      { key: 'factoryOwnerName', label: 'Owner Fábrica' },
      { key: 'lastReturnReason', label: 'Último motivo devolución' },
    ];

    const qb = this.semesterRepo
      .createQueryBuilder('semester')
      .innerJoinAndSelect('semester.project', 'project')
      .leftJoinAndSelect('project.productOwner', 'productOwner')
      .leftJoinAndSelect('project.factoryOwner', 'factoryOwner')
      .where('semester.deletedAt IS NULL');
    this.policy.applyProjectScope(qb, user);
    this.policy.applySemesterScope(qb, user);

    const from = parseDateFilter(query.dateFrom);
    const to = parseDateFilter(query.dateTo);
    if (from) {
      qb.andWhere('semester.operationalStageEnteredAt >= :dateFrom', { dateFrom: from });
    }
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('semester.operationalStageEnteredAt <= :dateTo', { dateTo: end });
    }
    if (query.operationalState) {
      qb.andWhere('semester.operationalState = :operationalState', {
        operationalState: query.operationalState,
      });
    }
    if (query.onlyFinalized) {
      qb.andWhere('semester.operationalState = :finalized', {
        finalized: InstitutionalOperationalState.FINALIZED,
      });
    }
    if (query.school && query.school !== 'all') {
      qb.andWhere('project.school = :school', { school: query.school });
    }
    if (query.query?.trim()) {
      const q = `%${query.query.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('LOWER(project.program) LIKE :q', { q })
            .orWhere('LOWER(project.school) LIKE :q', { q });
        }),
      );
    }

    const semesters = await qb.getMany();
    const now = new Date();

    let rows: Record<string, unknown>[] = semesters.map((sem) => {
      const sla = this.computeSemesterSla(sem);
      const responsible = responsibleRoleForState(sem.operationalState);
      const daysInStage = this.slaService.consumedBusinessDays(
        sem.operationalStageEnteredAt,
        sem.operationalFinalizedAt ?? now,
      );
      const businessDays = this.slaService.businessDaysForState(sem.operationalState);

      return {
        school: sem.project.school,
        program: sem.project.program,
        projectId: sem.project.id,
        semesterNumber: sem.semesterNumber,
        operationalState: institutionalStateLabel(sem.operationalState),
        stageBucket: stageBucketLabel(sem.operationalState),
        responsibleRole: roleLabel(responsible),
        responsibleRoleRaw: responsible,
        stageEnteredAt: formatReportDateTime(sem.operationalStageEnteredAt),
        stageDueAt: formatReportDateTime(sem.operationalStageDueAt),
        finalizedAt: formatReportDateTime(sem.operationalFinalizedAt),
        slaStatus: slaStatusLabel(sla),
        slaStatusRaw: sla,
        daysInStage,
        businessDaysAssigned: businessDays,
        productOwnerName: sem.project.productOwner?.name ?? '—',
        factoryOwnerName: sem.project.factoryOwner?.name ?? 'Sin asignar',
        lastReturnReason: sem.lastReturnReason ?? '—',
      };
    });

    rows.sort((a, b) => {
      const sa = SLA_SEVERITY[a.slaStatusRaw as SlaStatus] ?? 0;
      const sb = SLA_SEVERITY[b.slaStatusRaw as SlaStatus] ?? 0;
      if (sb !== sa) return sb - sa;
      return String(a.stageDueAt).localeCompare(String(b.stageDueAt));
    });

    if (query.slaStatus) {
      rows = rows.filter((r) => r.slaStatusRaw === query.slaStatus);
    }
    if (query.onlyOverdue) {
      rows = rows.filter((r) =>
        ['OVERDUE', 'FINALIZED_OVERDUE'].includes(String(r.slaStatusRaw)),
      );
    }
    if (query.responsibleRole) {
      rows = rows.filter((r) => r.responsibleRoleRaw === query.responsibleRole);
    }

    const total = rows.length;
    const paged = isExport ? rows.slice(0, limit) : rows.slice(offset, offset + limit);

    return {
      reportId: ReportId.SLA_COMPLIANCE,
      generatedAt: new Date().toISOString(),
      filters: filtersSnapshot(query),
      columns,
      rows: paged,
      total,
      page: query.page ?? 1,
      limit,
    };
  }

  private async auditTrail(
    query: ReportingQueryDto,
    user: UserEntity,
    limit: number,
    offset: number,
    isExport: boolean,
  ): Promise<ReportPreviewResponseDto> {
    const columns: ReportColumnDto[] = [
      { key: 'createdAt', label: 'Fecha' },
      { key: 'userName', label: 'Usuario' },
      { key: 'userRole', label: 'Rol' },
      { key: 'entityType', label: 'Entidad' },
      { key: 'entityId', label: 'ID entidad' },
      { key: 'action', label: 'Acción' },
      { key: 'summary', label: 'Resumen' },
    ];

    const qb = this.auditRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .orderBy('log.createdAt', 'DESC');

    const from = parseDateFilter(query.dateFrom);
    const to = parseDateFilter(query.dateTo);
    if (from) qb.andWhere('log.createdAt >= :dateFrom', { dateFrom: from });
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('log.createdAt <= :dateTo', { dateTo: end });
    }
    if (query.entityType) {
      qb.andWhere('log.entityType = :entityType', { entityType: query.entityType });
    }
    if (isUserRole(query.auditRole)) {
      qb.andWhere('user.role = :auditRole', { auditRole: query.auditRole });
    }

    const total = await qb.clone().getCount();
    if (!isExport) qb.skip(offset).take(limit);
    else qb.take(limit);

    const logs = await qb.getMany();
    const rows = logs.map((log) => ({
      createdAt: formatReportDateTime(log.createdAt),
      userName: log.user?.name ?? '—',
      userRole: log.user ? roleLabel(log.user.role) : '—',
      entityType: entityTypeLabel(log.entityType),
      entityId: log.entityId,
      action: log.action,
      summary: JSON.stringify(log.afterJson ?? log.beforeJson ?? {}).slice(0, 300),
    }));

    return {
      reportId: ReportId.AUDIT_TRAIL,
      generatedAt: new Date().toISOString(),
      filters: filtersSnapshot(query),
      columns,
      rows,
      total,
      page: query.page ?? 1,
      limit,
    };
  }

  private async productivityByUser(
    query: ReportingQueryDto,
    user: UserEntity,
    limit: number,
    offset: number,
    isExport: boolean,
  ): Promise<ReportPreviewResponseDto> {
    const columns: ReportColumnDto[] = [
      { key: 'userName', label: 'Usuario' },
      { key: 'userRole', label: 'Rol' },
      { key: 'transitionsCount', label: 'Transiciones' },
      { key: 'observationsCreated', label: 'Observaciones creadas' },
      { key: 'observationsResolved', label: 'Observaciones resueltas' },
    ];

    const from = parseDateFilter(query.dateFrom);
    const to = parseDateFilter(query.dateTo);

    let transitionQb = this.semesterTransitionRepo
      .createQueryBuilder('t')
      .innerJoin('t.actor', 'actor')
      .select('actor.id', 'userId')
      .addSelect('actor.name', 'userName')
      .addSelect('actor.role', 'userRole')
      .addSelect('COUNT(t.id)', 'transitionsCount')
      .groupBy('actor.id')
      .addGroupBy('actor.name')
      .addGroupBy('actor.role');
    if (from) transitionQb = transitionQb.andWhere('t.createdAt >= :dateFrom', { dateFrom: from });
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      transitionQb = transitionQb.andWhere('t.createdAt <= :dateTo', { dateTo: end });
    }
    if (isUserRole(query.auditRole)) {
      transitionQb = transitionQb.andWhere('actor.role = :auditRole', {
        auditRole: query.auditRole,
      });
    }

    const transitions = await transitionQb.getRawMany();

    let obsQb = this.observationRepo
      .createQueryBuilder('obs')
      .innerJoin('obs.author', 'author')
      .select('author.id', 'userId')
      .addSelect('COUNT(obs.id)', 'observationsCreated')
      .groupBy('author.id');
    if (from) obsQb = obsQb.andWhere('obs.createdAt >= :dateFrom', { dateFrom: from });
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      obsQb = obsQb.andWhere('obs.createdAt <= :dateTo', { dateTo: end });
    }
    const obsCreated = await obsQb.getRawMany();

    const merged = new Map<string, Record<string, unknown>>();
    for (const t of transitions) {
      merged.set(t.userId, {
        userName: t.userName,
        userRole: roleLabel(t.userRole),
        transitionsCount: Number(t.transitionsCount),
        observationsCreated: 0,
        observationsResolved: 0,
      });
    }
    for (const o of obsCreated) {
      const row = merged.get(o.userId) ?? {
        userName: '—',
        userRole: '—',
        transitionsCount: 0,
        observationsCreated: 0,
        observationsResolved: 0,
      };
      row.observationsCreated = Number(o.observationsCreated);
      merged.set(o.userId, row);
    }

    let rows = [...merged.values()].sort(
      (a, b) => Number(b.transitionsCount) - Number(a.transitionsCount),
    );
    const total = rows.length;
    if (!isExport) rows = rows.slice(offset, offset + limit);
    else rows = rows.slice(0, limit);

    return {
      reportId: ReportId.PRODUCTIVITY_BY_USER,
      generatedAt: new Date().toISOString(),
      filters: filtersSnapshot(query),
      columns,
      rows,
      total,
      page: query.page ?? 1,
      limit,
    };
  }

  private async productivityByRole(
    query: ReportingQueryDto,
    user: UserEntity,
    limit: number,
    offset: number,
    isExport: boolean,
  ): Promise<ReportPreviewResponseDto> {
    const columns: ReportColumnDto[] = [
      { key: 'role', label: 'Rol' },
      { key: 'transitionsCount', label: 'Transiciones' },
      { key: 'observationsCount', label: 'Observaciones' },
    ];

    const from = parseDateFilter(query.dateFrom);
    const to = parseDateFilter(query.dateTo);

    let qb = this.semesterTransitionRepo
      .createQueryBuilder('t')
      .select('t.actorRole', 'role')
      .addSelect('COUNT(t.id)', 'transitionsCount')
      .groupBy('t.actorRole');
    if (from) qb = qb.andWhere('t.createdAt >= :dateFrom', { dateFrom: from });
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      qb = qb.andWhere('t.createdAt <= :dateTo', { dateTo: end });
    }

    const transitions = await qb.getRawMany();

    let obsQb = this.observationRepo
      .createQueryBuilder('obs')
      .select('obs.role', 'role')
      .addSelect('COUNT(obs.id)', 'observationsCount')
      .groupBy('obs.role');
    if (from) obsQb = obsQb.andWhere('obs.createdAt >= :dateFrom', { dateFrom: from });
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      obsQb = obsQb.andWhere('obs.createdAt <= :dateTo', { dateTo: end });
    }
    const obs = await obsQb.getRawMany();

    const merged = new Map<string, Record<string, unknown>>();
    for (const t of transitions) {
      merged.set(t.role, {
        role: roleLabel(t.role),
        transitionsCount: Number(t.transitionsCount),
        observationsCount: 0,
      });
    }
    for (const o of obs) {
      const row = merged.get(o.role) ?? {
        role: roleLabel(o.role),
        transitionsCount: 0,
        observationsCount: 0,
      };
      row.observationsCount = Number(o.observationsCount);
      merged.set(o.role, row);
    }

    let rows = [...merged.values()];
    const total = rows.length;
    if (!isExport) rows = rows.slice(offset, offset + limit);
    else rows = rows.slice(0, limit);

    return {
      reportId: ReportId.PRODUCTIVITY_BY_ROLE,
      generatedAt: new Date().toISOString(),
      filters: filtersSnapshot(query),
      columns,
      rows,
      total,
      page: query.page ?? 1,
      limit,
    };
  }
}
