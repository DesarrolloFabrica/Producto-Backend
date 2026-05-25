import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { ChecklistStatus } from '../common/enums/checklist-status.enum';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { SubjectStatus } from '../common/enums/subject-status.enum';
import { StatusHistoryService } from '../audit/status-history.service';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { ObservationsService } from '../observations/observations.service';
import { ProjectEntity } from '../projects/project.entity';
import { SubjectEntity } from '../subjects/subject.entity';

interface ProjectSubjectAggregateRow {
  total: string | number;
  changesRequested: string | number;
  inReview: string | number;
  inReviewOrSubmitted: string | number;
  inProduction: string | number;
  approved: string | number;
}

@Injectable()
export class ProjectWorkflowService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(ChecklistItemEntity)
    private readonly checklistRepo: Repository<ChecklistItemEntity>,
    private readonly statusHistoryService: StatusHistoryService,
    @Inject(forwardRef(() => ObservationsService))
    private readonly observationsService: ObservationsService,
  ) {}

  async hasRejectedChecklistForProject(
    projectId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager ? manager.getRepository(ChecklistItemEntity) : this.checklistRepo;

    const count = await repo
      .createQueryBuilder('c')
      .innerJoin('c.subject', 'subject')
      .where('subject.projectId = :projectId', { projectId })
      .andWhere('subject.deletedAt IS NULL')
      .andWhere('c.status = :status', { status: ChecklistStatus.RECHAZADO })
      .getCount();

    return count > 0;
  }

  async deriveProjectStatus(
    projectId: string,
    manager?: EntityManager,
    knownProjectStatus?: ProjectStatus,
  ): Promise<ProjectStatus> {
    const subjectRepo = manager ? manager.getRepository(SubjectEntity) : this.subjectRepo;

    const currentStatus =
      knownProjectStatus ??
      (
        await (manager ? manager.getRepository(ProjectEntity) : this.projectRepo).findOne({
          where: { id: projectId },
          select: { id: true, status: true },
        })
      )?.status;

    if (!currentStatus) {
      throw new Error(`Project ${projectId} not found`);
    }

    if (currentStatus === ProjectStatus.CLOSED) {
      return ProjectStatus.CLOSED;
    }
    if (currentStatus === ProjectStatus.DELIVERED_TO_LMS) {
      return ProjectStatus.DELIVERED_TO_LMS;
    }

    const counts = await subjectRepo
      .createQueryBuilder('s')
      .select('COUNT(*)::int', 'total')
      .addSelect(
        `COUNT(*) FILTER (WHERE s.status = '${SubjectStatus.CHANGES_REQUESTED}')::int`,
        'changesRequested',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE s.status = '${SubjectStatus.IN_REVIEW}')::int`,
        'inReview',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE s.status IN ('${SubjectStatus.SUBMITTED}', '${SubjectStatus.IN_REVIEW}'))::int`,
        'inReviewOrSubmitted',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE s.status = '${SubjectStatus.IN_PRODUCTION}')::int`,
        'inProduction',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE s.status = '${SubjectStatus.APPROVED}')::int`,
        'approved',
      )
      .where('s."projectId" = :projectId', { projectId })
      .andWhere('s."deletedAt" IS NULL')
      .getRawOne<ProjectSubjectAggregateRow>();

    const total = Number(counts?.total ?? 0);
    const [hasBlocking, hasRejected] = await Promise.all([
      this.observationsService.hasBlockingObservationsForProject(projectId, manager),
      this.hasRejectedChecklistForProject(projectId, manager),
    ]);

    if (hasBlocking || hasRejected) {
      return ProjectStatus.FEEDBACK_PENDING;
    }

    if (Number(counts?.changesRequested ?? 0) > 0) {
      return ProjectStatus.FEEDBACK_PENDING;
    }

    if (Number(counts?.inReview ?? 0) > 0) {
      return ProjectStatus.IN_REVIEW;
    }

    if (Number(counts?.inReviewOrSubmitted ?? 0) > 0) {
      return ProjectStatus.IN_REVIEW;
    }

    if (Number(counts?.inProduction ?? 0) > 0) {
      return ProjectStatus.IN_PRODUCTION;
    }

    if (total > 0 && Number(counts?.approved ?? 0) === total) {
      return ProjectStatus.IN_REVIEW;
    }

    return currentStatus;
  }

  async updateProjectStatus(
    projectId: string,
    userId: string,
    manager?: EntityManager,
    knownPreviousStatus?: ProjectStatus,
  ): Promise<ProjectStatus> {
    const projectRepo = manager ? manager.getRepository(ProjectEntity) : this.projectRepo;

    const previousStatus =
      knownPreviousStatus ??
      (
        await projectRepo.findOne({
          where: { id: projectId },
          select: { id: true, status: true },
        })
      )?.status;

    if (!previousStatus) {
      throw new Error(`Project ${projectId} not found`);
    }

    const nextStatus = await this.deriveProjectStatus(projectId, manager, previousStatus);

    if (previousStatus !== nextStatus) {
      await projectRepo.update({ id: projectId }, { status: nextStatus });

      await this.statusHistoryService.recordIfChanged(
        {
          entityType: 'PROJECT',
          entityId: projectId,
          fromStatus: previousStatus,
          toStatus: nextStatus,
          changedById: userId,
        },
        manager,
      );
    }

    return nextStatus;
  }
}
