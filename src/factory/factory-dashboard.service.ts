import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { SubjectMatterExpertStatus } from '../common/enums/subject-matter-expert-status.enum';
import { SubjectOperationalState } from '../common/enums/subject-operational-state.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { ObservationEntity } from '../observations/observation.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectsService } from '../subjects/subjects.service';
import { SubjectEntity } from '../subjects/subject.entity';
import { UserEntity } from '../users/user.entity';
import {
  responsibleRoleForState,
  statesPendingForRole,
} from '../institutional-workflow/institutional-workflow.transitions';
import {
  FactoryDashboardCountsDto,
  FactoryDashboardSummaryDto,
  FactorySubjectsQueryDto,
} from './dto/factory-dashboard-summary.dto';
import {
  FactoryProgramsPageDto,
} from './dto/factory-program-work-item.dto';
import {
  FactorySubjectWorkItemDto,
  FactorySubjectsPageDto,
} from './dto/factory-subject-work-item.dto';
import { aggregateFactoryItemsToPrograms } from './factory-program-aggregator';

/** Semestres donde Fábrica tiene trabajo activo (bandeja operacional). */
const FACTORY_ACTIVE_SEMESTER_STATES = statesPendingForRole(UserRole.FABRICA);

/**
 * Semestres visibles en dashboard/paquetes: trabajo activo + seguimiento post-entrega
 * y pendientes de liberación por Planeación.
 */
const FACTORY_VISIBLE_SEMESTER_STATES: InstitutionalOperationalState[] = [
  ...new Set([
    ...FACTORY_ACTIVE_SEMESTER_STATES,
    InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION,
    InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION,
    InstitutionalOperationalState.PENDING_LMS_UPLOAD,
    InstitutionalOperationalState.IN_LMS_UPLOAD,
    InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION,
    InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING,
    InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW,
    InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW,
    InstitutionalOperationalState.RETURNED_TO_PRODUCT_FROM_PLANNING,
    InstitutionalOperationalState.PENDING_PROJECT_RADICATION,
    InstitutionalOperationalState.FINALIZED,
  ]),
];

interface SemesterRow {
  subjectId: string | null;
  semesterId: string;
  subjectsTotal: string | number;
  subjectsReady: string | number;
  subjectsUpdatedAt: Date | null;
  expectedDeliveryDate: Date | null;
  semesterFactoryExpectedDate: Date | null;
  projectExpectedDeliveryDate: Date | null;
  projectId: string;
  program: string;
  school: string;
  priority: ProjectEntity['priority'];
  projectStatus: ProjectStatus;
  semesterNumber: number;
  createdFromChange: boolean;
  semesterOperationalState: InstitutionalOperationalState;
  semesterStageDueAt: Date | null;
}

@Injectable()
export class FactoryDashboardService {
  constructor(
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(SemesterEntity)
    private readonly semesterRepo: Repository<SemesterEntity>,
    @InjectRepository(ObservationEntity)
    private readonly observationRepo: Repository<ObservationEntity>,
    private readonly subjectsService: SubjectsService,
  ) {}

  private assertFactoryAccess(user: UserEntity): void {
    if (user.role !== UserRole.FABRICA && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only FABRICA or ADMIN can access factory dashboard');
    }
  }

  private async loadObservationCounts(
    semesterIds: string[],
  ): Promise<Map<string, { open: number; correctionSent: number }>> {
    if (!semesterIds.length) return new Map();
    const rows = await this.observationRepo.manager.query(
      `
      SELECT
        s."semesterId" AS "semesterId",
        COUNT(o.id) FILTER (
          WHERE o.status = 'ABIERTA' AND o."notificationStatus" = 'SENT'
        )::int AS open,
        COUNT(o.id) FILTER (WHERE o.status = 'EN_CORRECCION')::int AS "correctionSent"
      FROM subjects s
      LEFT JOIN observations o ON o."subjectId" = s.id AND o.role = 'PRODUCT'
      WHERE s."semesterId" = ANY($1::uuid[])
        AND s."deletedAt" IS NULL
      GROUP BY s."semesterId"
      `,
      [semesterIds],
    );
    return new Map(
      rows.map((r: { semesterId: string; open: number; correctionSent: number }) => [
        r.semesterId,
        { open: Number(r.open ?? 0), correctionSent: Number(r.correctionSent ?? 0) },
      ]),
    );
  }

  private async fetchSemesterRows(user: UserEntity): Promise<SemesterRow[]> {
    const qb = this.semesterRepo
      .createQueryBuilder('semester')
      .innerJoin('semester.project', 'project')
      .leftJoin('semester.subjects', 'subject', 'subject.deletedAt IS NULL')
      .where('semester.deletedAt IS NULL')
      .andWhere('project.deletedAt IS NULL')
      .andWhere('project.legacyWorkflow = false')
      .andWhere('project.subjectMatterExpertStatus = :smeReady', {
        smeReady: SubjectMatterExpertStatus.READY,
      })
      .andWhere('semester.operational_state IN (:...states)', {
        states: FACTORY_VISIBLE_SEMESTER_STATES,
      });

    if (user.role !== UserRole.ADMIN) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('project.factoryOwnerId = :userId', { userId: user.id })
            .orWhere('project.factoryOwnerId IS NULL');
        }),
      );
    }

    return qb
      .select('MIN(subject.id::text)', 'subjectId')
      .addSelect('semester.id', 'semesterId')
      .addSelect('COUNT(subject.id)::int', 'subjectsTotal')
      .addSelect(
        `COUNT(subject.id) FILTER (WHERE subject.factory_production_status = 'COMPLETED' OR subject.progress >= 100)::int`,
        'subjectsReady',
      )
      .addSelect('MAX(subject.updatedAt)', 'subjectsUpdatedAt')
      .addSelect('MIN(subject.expectedDeliveryDate)', 'expectedDeliveryDate')
      .addSelect('semester.factoryExpectedDate', 'semesterFactoryExpectedDate')
      .addSelect('project.expectedDeliveryDate', 'projectExpectedDeliveryDate')
      .addSelect('project.id', 'projectId')
      .addSelect('project.program', 'program')
      .addSelect('project.school', 'school')
      .addSelect('project.priority', 'priority')
      .addSelect('project.status', 'projectStatus')
      .addSelect('semester.semesterNumber', 'semesterNumber')
      .addSelect('semester.createdFromChange', 'createdFromChange')
      .addSelect('semester.operationalState', 'semesterOperationalState')
      .addSelect('semester.operationalStageDueAt', 'semesterStageDueAt')
      .groupBy('semester.id')
      .addGroupBy('project.id')
      .orderBy('semester.operationalStageDueAt', 'ASC', 'NULLS LAST')
      .addOrderBy('semester.updatedAt', 'DESC')
      .getRawMany<SemesterRow>();
  }

  private mapSemesterState(state: InstitutionalOperationalState): SubjectOperationalState {
    switch (state) {
      case InstitutionalOperationalState.PENDING_FACTORY:
        return SubjectOperationalState.NOT_STARTED;
      case InstitutionalOperationalState.IN_FACTORY_PRODUCTION:
        return SubjectOperationalState.IN_PRODUCTION;
      case InstitutionalOperationalState.RETURNED_TO_FACTORY_FROM_PLANNING:
      case InstitutionalOperationalState.CHANGES_REQUESTED_BY_PRODUCT:
        return SubjectOperationalState.CHANGES_REQUESTED;
      case InstitutionalOperationalState.FINALIZED:
        return SubjectOperationalState.APPROVED;
      case InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION:
      case InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION:
      case InstitutionalOperationalState.PENDING_LMS_UPLOAD:
      case InstitutionalOperationalState.IN_LMS_UPLOAD:
      case InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION:
      case InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING:
      case InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW:
      case InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW:
      case InstitutionalOperationalState.RETURNED_TO_PRODUCT_FROM_PLANNING:
      case InstitutionalOperationalState.PENDING_PROJECT_RADICATION:
        return SubjectOperationalState.IN_REVIEW;
      default:
        return SubjectOperationalState.IN_REVIEW;
    }
  }

  private toWorkItem(
    row: SemesterRow,
    obs: { open: number; correctionSent: number },
  ): FactorySubjectWorkItemDto {
    const institutionalOperationalState = row.semesterOperationalState;
    const operationalState = this.mapSemesterState(institutionalOperationalState);
    const subjectsTotal = Number(row.subjectsTotal ?? 0);
    const subjectsReady = Number(row.subjectsReady ?? 0);
    return {
      subjectId: row.subjectId ?? row.semesterId,
      semesterId: row.semesterId,
      subjectName: `Semestre ${row.semesterNumber}`,
      projectId: row.projectId,
      program: row.program,
      school: row.school,
      semesterNumber: row.semesterNumber,
      expectedDeliveryDate:
        row.semesterStageDueAt ??
        row.expectedDeliveryDate ??
        row.semesterFactoryExpectedDate ??
        row.projectExpectedDeliveryDate,
      priority: row.priority,
      operationalState,
      institutionalOperationalState,
      currentResponsibleRole: responsibleRoleForState(institutionalOperationalState),
      openObservationsCount: obs.open,
      correctionSentCount: obs.correctionSent,
      lastActivity: row.subjectsUpdatedAt,
      actionUrl: `/projects/${row.projectId}/semesters/${row.semesterId}/operations`,
      createdFromChange: Boolean(row.createdFromChange),
      subjectsTotal,
      subjectsReady,
    };
  }

  private async buildAllWorkItems(user: UserEntity): Promise<FactorySubjectWorkItemDto[]> {
    const rows = await this.fetchSemesterRows(user);
    const obsMap = await this.loadObservationCounts(rows.map((r) => r.semesterId));
    return rows.map((row) =>
      this.toWorkItem(row, obsMap.get(row.semesterId) ?? { open: 0, correctionSent: 0 }),
    );
  }

  async getSummary(user: UserEntity): Promise<FactoryDashboardSummaryDto> {
    this.assertFactoryAccess(user);
    const items = await this.buildAllWorkItems(user);

    const countsByState: FactoryDashboardCountsDto = {
      NOT_STARTED: 0,
      IN_PRODUCTION: 0,
      IN_REVIEW: 0,
      CHANGES_REQUESTED: 0,
      CORRECTION_SENT: 0,
      APPROVED: 0,
    };
    for (const item of items) {
      countsByState[item.operationalState] += 1;
    }

    const totalAssigned = items.length;
    const priorityRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const toTs = (value?: Date | string | null) => {
      if (!value) return 0;
      const d = typeof value === 'string' ? new Date(value) : value;
      const ts = d instanceof Date ? d.getTime() : 0;
      return Number.isFinite(ts) ? ts : 0;
    };

    const compareDueAsc = (a: FactorySubjectWorkItemDto, b: FactorySubjectWorkItemDto) =>
      toTs(a.expectedDeliveryDate) - toTs(b.expectedDeliveryDate);
    const compareLastActivityDesc = (a: FactorySubjectWorkItemDto, b: FactorySubjectWorkItemDto) =>
      toTs(b.lastActivity) - toTs(a.lastActivity);
    const comparePriorityThenDue = (a: FactorySubjectWorkItemDto, b: FactorySubjectWorkItemDto) => {
      const prio = (priorityRank[String(a.priority)] ?? 9) - (priorityRank[String(b.priority)] ?? 9);
      if (prio !== 0) return prio;
      return compareDueAsc(a, b);
    };

    const pendingCorrectionsTop = items
      .filter((i) => i.operationalState === SubjectOperationalState.CHANGES_REQUESTED)
      .sort((a, b) => b.openObservationsCount - a.openObservationsCount || compareLastActivityDesc(a, b))
      .slice(0, 5);
    const upcomingDeliveriesTop = items
      .filter((i) =>
        i.operationalState === SubjectOperationalState.NOT_STARTED ||
        i.operationalState === SubjectOperationalState.IN_PRODUCTION)
      .filter((i) => i.expectedDeliveryDate)
      .sort(compareDueAsc)
      .slice(0, 5);
    const inProductionTop = items
      .filter((i) => i.operationalState === SubjectOperationalState.IN_PRODUCTION)
      .sort(comparePriorityThenDue)
      .slice(0, 5);
    const notStartedTop = items
      .filter((i) => i.operationalState === SubjectOperationalState.NOT_STARTED)
      .sort(comparePriorityThenDue)
      .slice(0, 5);
    const inReviewTop = items
      .filter((i) => i.operationalState === SubjectOperationalState.IN_REVIEW)
      .sort(compareLastActivityDesc)
      .slice(0, 5);
    const recentlyCompletedTop = items
      .filter((i) => i.operationalState === SubjectOperationalState.APPROVED)
      .sort(compareLastActivityDesc)
      .slice(0, 5);

    const dueSoonTs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const overdueOrDueSoonCount = items.filter((i) => {
      const ts = toTs(i.expectedDeliveryDate);
      return ts > 0 && ts <= dueSoonTs && i.operationalState !== SubjectOperationalState.APPROVED;
    }).length;

    return {
      countsByState,
      totalAssigned,
      notStartedTop,
      inProductionTop,
      inReviewTop,
      pendingCorrectionsTop,
      upcomingDeliveriesTop,
      recentlyCompletedTop,
      overdueOrDueSoonCount,
    };
  }

  async listSubjects(
    user: UserEntity,
    query: FactorySubjectsQueryDto,
  ): Promise<FactorySubjectsPageDto> {
    this.assertFactoryAccess(user);
    let items = await this.buildAllWorkItems(user);

    if (query.origin === 'new') items = items.filter((i) => i.createdFromChange);
    else if (query.origin === 'original') items = items.filter((i) => !i.createdFromChange);
    if (query.status) items = items.filter((i) => i.operationalState === query.status);
    if (query.projectId) items = items.filter((i) => i.projectId === query.projectId);
    if (query.program) {
      const program = query.program.toLowerCase();
      items = items.filter((i) => i.program.toLowerCase().includes(program));
    }
    if (query.semester !== undefined) items = items.filter((i) => i.semesterNumber === Number(query.semester));
    if (query.priority) items = items.filter((i) => i.priority === query.priority);
    if (query.search) {
      const q = query.search.toLowerCase();
      items = items.filter((i) =>
        i.subjectName.toLowerCase().includes(q) ||
        i.program.toLowerCase().includes(q) ||
        i.school.toLowerCase().includes(q));
    }
    if (query.dueFrom) {
      const from = new Date(query.dueFrom).getTime();
      items = items.filter((i) => i.expectedDeliveryDate && new Date(i.expectedDeliveryDate).getTime() >= from);
    }
    if (query.dueTo) {
      const to = new Date(query.dueTo).getTime();
      items = items.filter((i) => i.expectedDeliveryDate && new Date(i.expectedDeliveryDate).getTime() <= to);
    }

    const sort = query.sort ?? 'updatedAt';
    items.sort((a, b) => {
      if (sort === 'dueDate') {
        return new Date(a.expectedDeliveryDate ?? 0).getTime() - new Date(b.expectedDeliveryDate ?? 0).getTime();
      }
      if (sort === 'priority') {
        const rank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
      }
      return new Date(b.lastActivity ?? 0).getTime() - new Date(a.lastActivity ?? 0).getTime();
    });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const total = items.length;
    const start = (page - 1) * limit;
    return { items: items.slice(start, start + limit), total, page, limit };
  }

  async listPrograms(
    user: UserEntity,
    query: FactorySubjectsQueryDto,
  ): Promise<FactoryProgramsPageDto> {
    this.assertFactoryAccess(user);
    let semesterItems = await this.buildAllWorkItems(user);

    if (query.origin === 'new') semesterItems = semesterItems.filter((i) => i.createdFromChange);
    else if (query.origin === 'original') semesterItems = semesterItems.filter((i) => !i.createdFromChange);
    if (query.status) semesterItems = semesterItems.filter((i) => i.operationalState === query.status);
    if (query.projectId) semesterItems = semesterItems.filter((i) => i.projectId === query.projectId);
    if (query.program) {
      const program = query.program.toLowerCase();
      semesterItems = semesterItems.filter((i) => i.program.toLowerCase().includes(program));
    }
    if (query.semester !== undefined) {
      semesterItems = semesterItems.filter((i) => i.semesterNumber === Number(query.semester));
    }
    if (query.priority) semesterItems = semesterItems.filter((i) => i.priority === query.priority);
    if (query.search) {
      const q = query.search.toLowerCase();
      semesterItems = semesterItems.filter(
        (i) =>
          i.subjectName.toLowerCase().includes(q) ||
          i.program.toLowerCase().includes(q) ||
          i.school.toLowerCase().includes(q),
      );
    }

    let programs = aggregateFactoryItemsToPrograms(semesterItems);

    if (query.dueFrom) {
      const from = new Date(query.dueFrom).getTime();
      programs = programs.filter(
        (p) => p.nearestDueDate && new Date(p.nearestDueDate).getTime() >= from,
      );
    }
    if (query.dueTo) {
      const to = new Date(query.dueTo).getTime();
      programs = programs.filter(
        (p) => p.nearestDueDate && new Date(p.nearestDueDate).getTime() <= to,
      );
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const total = programs.length;
    const start = (page - 1) * limit;
    return { items: programs.slice(start, start + limit), total, page, limit };
  }

  async getSubjectDetail(subjectId: string, user: UserEntity) {
    this.assertFactoryAccess(user);
    const subject = await this.subjectRepo.findOne({
      where: { id: subjectId },
      relations: { project: { productOwner: true, factoryOwner: true } },
    });
    if (!subject?.project) throw new NotFoundException('Subject not found');
    return this.subjectsService.getDetailById(subjectId, user);
  }
}
