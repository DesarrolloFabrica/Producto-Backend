import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { SubjectMatterExpertStatus } from '../common/enums/subject-matter-expert-status.enum';
import { SubjectOperationalState } from '../common/enums/subject-operational-state.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { ObservationEntity } from '../observations/observation.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SubjectsService } from '../subjects/subjects.service';
import { SubjectEntity } from '../subjects/subject.entity';
import { UserEntity } from '../users/user.entity';
import {
  FactoryDashboardCountsDto,
  FactoryDashboardSummaryDto,
  FactorySubjectsQueryDto,
} from './dto/factory-dashboard-summary.dto';
import {
  FactorySubjectWorkItemDto,
  FactorySubjectsPageDto,
} from './dto/factory-subject-work-item.dto';
import {
  buildSubjectActionUrl,
  deriveSubjectOperationalState,
} from './utils/operational-state.util';
import { loadProductObservationCountsBySubject } from '../observations/observation-subject-query.util';

interface SubjectRow {
  subjectId: string;
  subjectName: string;
  subjectStatus: SubjectEntity['status'];
  subjectProgress: number;
  subjectUpdatedAt: Date;
  expectedDeliveryDate: Date | null;
  semesterFactoryExpectedDate: Date | null;
  projectExpectedDeliveryDate: Date;
  projectId: string;
  program: string;
  school: string;
  priority: ProjectEntity['priority'];
  projectStatus: ProjectStatus;
  semesterNumber: number;
  createdFromChange: boolean;
}

@Injectable()
export class FactoryDashboardService {
  constructor(
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(ObservationEntity)
    private readonly observationRepo: Repository<ObservationEntity>,
    private readonly subjectsService: SubjectsService,
  ) {}

  private assertFactoryAccess(user: UserEntity): void {
    if (user.role !== UserRole.FABRICA && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only FABRICA or ADMIN can access factory dashboard');
    }
  }

  private applyProjectVisibility(
    qb: SelectQueryBuilder<SubjectEntity>,
    user: UserEntity,
  ): SelectQueryBuilder<SubjectEntity> {
    qb.innerJoin('subject.project', 'project')
      .innerJoin('subject.semester', 'semester')
      .where('subject.deletedAt IS NULL')
      .andWhere('project.deletedAt IS NULL')
      .andWhere('project.subjectMatterExpertStatus = :smeReady', {
        smeReady: SubjectMatterExpertStatus.READY,
      });

    if (user.role === UserRole.ADMIN) {
      return qb;
    }

    return qb.andWhere(
      new Brackets((sub) => {
        sub
          .where('project.factoryOwnerId = :userId', { userId: user.id })
          .orWhere(
            new Brackets((unassigned) => {
              unassigned
                .where('project.factoryOwnerId IS NULL')
                .andWhere('project.status IN (:...visibleStatuses)', {
                  visibleStatuses: [
                    ProjectStatus.READY_FOR_PRODUCTION,
                    ProjectStatus.IN_PRODUCTION,
                    ProjectStatus.FEEDBACK_PENDING,
                    ProjectStatus.IN_REVIEW,
                  ],
                });
            }),
          );
      }),
    );
  }

  private async loadObservationCounts(
    subjectIds: string[],
  ): Promise<Map<string, { open: number; correctionSent: number }>> {
    return loadProductObservationCountsBySubject(this.observationRepo, subjectIds);
  }

  private async fetchSubjectRows(user: UserEntity): Promise<SubjectRow[]> {
    const qb = this.subjectRepo.createQueryBuilder('subject');
    this.applyProjectVisibility(qb, user);
    return qb
      .select('subject.id', 'subjectId')
      .addSelect('subject.name', 'subjectName')
      .addSelect('subject.status', 'subjectStatus')
      .addSelect('subject.progress', 'subjectProgress')
      .addSelect('subject.updatedAt', 'subjectUpdatedAt')
      .addSelect('subject.expectedDeliveryDate', 'expectedDeliveryDate')
      .addSelect('semester.factoryExpectedDate', 'semesterFactoryExpectedDate')
      .addSelect('project.expectedDeliveryDate', 'projectExpectedDeliveryDate')
      .addSelect('project.id', 'projectId')
      .addSelect('project.program', 'program')
      .addSelect('project.school', 'school')
      .addSelect('project.priority', 'priority')
      .addSelect('project.status', 'projectStatus')
      .addSelect('semester.semesterNumber', 'semesterNumber')
      .addSelect('subject.createdFromChange', 'createdFromChange')
      .getRawMany<SubjectRow>();
  }

  private toWorkItem(
    row: SubjectRow,
    obs: { open: number; correctionSent: number },
  ): FactorySubjectWorkItemDto {
    const operationalState = deriveSubjectOperationalState({
      subjectStatus: row.subjectStatus,
      projectStatus: row.projectStatus,
      openObservationsCount: obs.open,
      correctionSentCount: obs.correctionSent,
    });
    return {
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      projectId: row.projectId,
      program: row.program,
      school: row.school,
      semesterNumber: row.semesterNumber,
      expectedDeliveryDate:
        row.expectedDeliveryDate ??
        row.semesterFactoryExpectedDate ??
        row.projectExpectedDeliveryDate,
      priority: row.priority,
      operationalState,
      openObservationsCount: obs.open,
      correctionSentCount: obs.correctionSent,
      lastActivity: row.subjectUpdatedAt,
      actionUrl: buildSubjectActionUrl(row.subjectId, operationalState, obs.open),
      createdFromChange: Boolean(row.createdFromChange),
    };
  }

  private async buildAllWorkItems(user: UserEntity): Promise<FactorySubjectWorkItemDto[]> {
    const rows = await this.fetchSubjectRows(user);
    const obsMap = await this.loadObservationCounts(rows.map((r) => r.subjectId));
    return rows.map((row) =>
      this.toWorkItem(row, obsMap.get(row.subjectId) ?? { open: 0, correctionSent: 0 }),
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

    const priorityRank: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
    };

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
      .sort((a, b) => {
        const obs = b.openObservationsCount - a.openObservationsCount;
        if (obs !== 0) return obs;
        return compareLastActivityDesc(a, b);
      })
      .slice(0, 5);

    const upcomingDeliveriesTop = items
      .filter(
        (i) =>
          i.operationalState === SubjectOperationalState.NOT_STARTED ||
          i.operationalState === SubjectOperationalState.IN_PRODUCTION,
      )
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

    const dueSoonDays = 7;
    const now = Date.now();
    const dueSoonTs = now + dueSoonDays * 24 * 60 * 60 * 1000;
    const overdueOrDueSoonCount = items.filter((i) => {
      if (!i.expectedDeliveryDate) return false;
      const ts = toTs(i.expectedDeliveryDate);
      if (!ts) return false;
      if (i.operationalState === SubjectOperationalState.APPROVED) return false;
      return ts <= dueSoonTs;
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

    if (query.origin === 'new') {
      items = items.filter((i) => i.createdFromChange);
    } else if (query.origin === 'original') {
      items = items.filter((i) => !i.createdFromChange);
    }
    if (query.status) {
      items = items.filter((i) => i.operationalState === query.status);
    }
    if (query.projectId) {
      items = items.filter((i) => i.projectId === query.projectId);
    }
    if (query.program) {
      const program = query.program.toLowerCase();
      items = items.filter((i) => i.program.toLowerCase().includes(program));
    }
    if (query.semester !== undefined) {
      items = items.filter((i) => i.semesterNumber === Number(query.semester));
    }
    if (query.priority) {
      items = items.filter((i) => i.priority === query.priority);
    }
    if (query.search) {
      const q = query.search.toLowerCase();
      items = items.filter(
        (i) =>
          i.subjectName.toLowerCase().includes(q) ||
          i.program.toLowerCase().includes(q) ||
          i.school.toLowerCase().includes(q),
      );
    }
    if (query.dueFrom) {
      const from = new Date(query.dueFrom).getTime();
      items = items.filter(
        (i) => i.expectedDeliveryDate && new Date(i.expectedDeliveryDate).getTime() >= from,
      );
    }
    if (query.dueTo) {
      const to = new Date(query.dueTo).getTime();
      items = items.filter(
        (i) => i.expectedDeliveryDate && new Date(i.expectedDeliveryDate).getTime() <= to,
      );
    }

    const sort = query.sort ?? 'updatedAt';
    items.sort((a, b) => {
      if (sort === 'dueDate') {
        return (
          new Date(a.expectedDeliveryDate ?? 0).getTime() -
          new Date(b.expectedDeliveryDate ?? 0).getTime()
        );
      }
      if (sort === 'priority') {
        const rank: Record<string, number> = {
          CRITICAL: 0,
          HIGH: 1,
          MEDIUM: 2,
          LOW: 3,
        };
        return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
      }
      return (
        new Date(b.lastActivity ?? 0).getTime() - new Date(a.lastActivity ?? 0).getTime()
      );
    });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const total = items.length;
    const start = (page - 1) * limit;

    return {
      items: items.slice(start, start + limit),
      total,
      page,
      limit,
    };
  }

  async getSubjectDetail(subjectId: string, user: UserEntity) {
    this.assertFactoryAccess(user);
    const subject = await this.subjectRepo.findOne({
      where: { id: subjectId },
      relations: { project: { productOwner: true, factoryOwner: true } },
    });
    if (!subject?.project) {
      throw new NotFoundException('Subject not found');
    }
    return this.subjectsService.getDetailById(subjectId, user);
  }
}
