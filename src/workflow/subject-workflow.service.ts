import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ChecklistStatus } from '../common/enums/checklist-status.enum';
import { SubjectStatus } from '../common/enums/subject-status.enum';
import { StatusHistoryService } from '../audit/status-history.service';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { ObservationsService } from '../observations/observations.service';
import { SubjectEntity } from '../subjects/subject.entity';

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

    const items = await checklistRepo.find({
      where: { subject: { id: subjectId } },
    });

    if (items.length === 0) {
      return SubjectStatus.PENDING;
    }

    if (items.some((item) => item.status === ChecklistStatus.RECHAZADO)) {
      return SubjectStatus.CHANGES_REQUESTED;
    }

    const hasBlocking = await this.observationsService.hasBlockingObservationsForSubject(
      subjectId,
      manager,
    );
    if (hasBlocking) {
      return SubjectStatus.CHANGES_REQUESTED;
    }

    if (items.some((item) => item.status === ChecklistStatus.EN_PRODUCCION)) {
      return SubjectStatus.IN_PRODUCTION;
    }

    if (items.every((item) => item.status === ChecklistStatus.APROBADO)) {
      return SubjectStatus.APPROVED;
    }

    if (
      items.every((item) =>
        [ChecklistStatus.ENTREGADO, ChecklistStatus.APROBADO].includes(item.status),
      )
    ) {
      return SubjectStatus.SUBMITTED;
    }

    return SubjectStatus.PENDING;
  }

  async updateSubjectStatus(
    subjectId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<SubjectEntity> {
    const subjectRepo = manager ? manager.getRepository(SubjectEntity) : this.subjectRepo;
    const subject = await subjectRepo.findOne({ where: { id: subjectId } });

    if (!subject) {
      throw new Error(`Subject ${subjectId} not found`);
    }

    const nextStatus = await this.deriveSubjectStatus(subjectId, manager);
    const previousStatus = subject.status;

    if (previousStatus !== nextStatus) {
      subject.status = nextStatus;
      await subjectRepo.save(subject);

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

    return subject;
  }
}
