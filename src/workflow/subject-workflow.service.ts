import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ChecklistStatus } from '../common/enums/checklist-status.enum';
import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { SubjectStatus } from '../common/enums/subject-status.enum';
import { isInstitutionalWorkflowEnabled } from '../institutional-workflow/institutional-workflow.config';
import { StatusHistoryService } from '../audit/status-history.service';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { ObservationsService } from '../observations/observations.service';
import { SubjectEntity } from '../subjects/subject.entity';

interface SubjectChecklistAggregateRow {
  total: string | number;
  rejected: string | number;
  inProduction: string | number;
  approved: string | number;
  deliveredOrApproved: string | number;
}

@Injectable()
export class SubjectWorkflowService {
  constructor(
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(ChecklistItemEntity)
    private readonly checklistRepo: Repository<ChecklistItemEntity>,
    private readonly statusHistoryService: StatusHistoryService,
    @Inject(forwardRef(() => ObservationsService))
    private readonly observationsService: ObservationsService,
  ) {}

  async deriveSubjectStatus(subjectId: string, manager?: EntityManager): Promise<SubjectStatus> {
    const checklistRepo = manager
      ? manager.getRepository(ChecklistItemEntity)
      : this.checklistRepo;

    const counts = await checklistRepo
      .createQueryBuilder('c')
      .select('COUNT(*)::int', 'total')
      .addSelect(
        `COUNT(*) FILTER (WHERE c.status = '${ChecklistStatus.RECHAZADO}')::int`,
        'rejected',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE c.status = '${ChecklistStatus.EN_PRODUCCION}')::int`,
        'inProduction',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE c.status = '${ChecklistStatus.APROBADO}')::int`,
        'approved',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE c.status IN ('${ChecklistStatus.ENTREGADO}', '${ChecklistStatus.APROBADO}'))::int`,
        'deliveredOrApproved',
      )
      .where('c."subjectId" = :subjectId', { subjectId })
      .getRawOne<SubjectChecklistAggregateRow>();

    const total = Number(counts?.total ?? 0);
    if (total === 0) {
      return SubjectStatus.PENDING;
    }

    if (Number(counts?.rejected ?? 0) > 0) {
      return SubjectStatus.CHANGES_REQUESTED;
    }

    const hasBlocking = await this.observationsService.hasBlockingObservationsForSubject(
      subjectId,
      manager,
    );
    if (hasBlocking) {
      return SubjectStatus.CHANGES_REQUESTED;
    }

    if (Number(counts?.inProduction ?? 0) > 0) {
      return SubjectStatus.IN_PRODUCTION;
    }

    if (Number(counts?.approved ?? 0) === total) {
      return SubjectStatus.APPROVED;
    }

    if (Number(counts?.deliveredOrApproved ?? 0) === total) {
      return SubjectStatus.SUBMITTED;
    }

    return SubjectStatus.PENDING;
  }

  async updateSubjectStatus(
    subjectId: string,
    userId: string,
    manager?: EntityManager,
    knownPreviousStatus?: SubjectStatus,
  ): Promise<SubjectStatus> {
    const subjectRepo = manager ? manager.getRepository(SubjectEntity) : this.subjectRepo;

    const previousStatus =
      knownPreviousStatus ??
      (
        await subjectRepo.findOne({
          where: { id: subjectId },
          select: { id: true, status: true },
        })
      )?.status;

    if (!previousStatus) {
      throw new Error(`Subject ${subjectId} not found`);
    }

    const subjectRow = await subjectRepo.findOne({
      where: { id: subjectId },
      relations: { project: true },
      select: {
        id: true,
        status: true,
        operationalState: true,
        project: { id: true, legacyWorkflow: true },
      },
    });
    if (
      isInstitutionalWorkflowEnabled() &&
      subjectRow?.project &&
      !subjectRow.project.legacyWorkflow
    ) {
      const factoryPhases = new Set<InstitutionalOperationalState>([
        InstitutionalOperationalState.PENDING_FACTORY,
        InstitutionalOperationalState.IN_FACTORY_PRODUCTION,
        InstitutionalOperationalState.RETURNED_TO_FACTORY_FROM_PLANNING,
        InstitutionalOperationalState.CHANGES_REQUESTED_BY_PRODUCT,
      ]);
      if (!factoryPhases.has(subjectRow.operationalState)) {
        return previousStatus;
      }
    }

    const nextStatus = await this.deriveSubjectStatus(subjectId, manager);

    if (previousStatus !== nextStatus) {
      await subjectRepo.update({ id: subjectId }, { status: nextStatus });

      await this.statusHistoryService.recordIfChanged(
        {
          entityType: 'SUBJECT',
          entityId: subjectId,
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
