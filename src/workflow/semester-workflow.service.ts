import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SemesterStatus } from '../common/enums/semester-status.enum';
import { SubjectStatus } from '../common/enums/subject-status.enum';
import { StatusHistoryService } from '../audit/status-history.service';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectEntity } from '../subjects/subject.entity';

interface SemesterSubjectAggregateRow {
  total: string | number;
  changesRequested: string | number;
  approved: string | number;
  inReviewOrSubmitted: string | number;
  inProduction: string | number;
  pending: string | number;
}

@Injectable()
export class SemesterWorkflowService {
  constructor(
    @InjectRepository(SemesterEntity)
    private readonly semesterRepo: Repository<SemesterEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    private readonly statusHistoryService: StatusHistoryService,
  ) {}

  async deriveSemesterStatus(semesterId: string, manager?: EntityManager): Promise<SemesterStatus> {
    const subjectRepo = manager ? manager.getRepository(SubjectEntity) : this.subjectRepo;

    const counts = await subjectRepo
      .createQueryBuilder('s')
      .select('COUNT(*)::int', 'total')
      .addSelect(
        `COUNT(*) FILTER (WHERE s.status = '${SubjectStatus.CHANGES_REQUESTED}')::int`,
        'changesRequested',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE s.status = '${SubjectStatus.APPROVED}')::int`,
        'approved',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE s.status IN ('${SubjectStatus.IN_REVIEW}', '${SubjectStatus.SUBMITTED}'))::int`,
        'inReviewOrSubmitted',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE s.status = '${SubjectStatus.IN_PRODUCTION}')::int`,
        'inProduction',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE s.status = '${SubjectStatus.PENDING}')::int`,
        'pending',
      )
      .where('s."semesterId" = :semesterId', { semesterId })
      .andWhere('s."deletedAt" IS NULL')
      .getRawOne<SemesterSubjectAggregateRow>();

    const total = Number(counts?.total ?? 0);
    if (total === 0) {
      return SemesterStatus.PENDING;
    }

    if (Number(counts?.changesRequested ?? 0) > 0) {
      return SemesterStatus.CHANGES_REQUESTED;
    }

    if (Number(counts?.approved ?? 0) === total) {
      return SemesterStatus.APPROVED;
    }

    if (Number(counts?.inReviewOrSubmitted ?? 0) > 0) {
      return SemesterStatus.PARTIAL_REVIEW;
    }

    if (Number(counts?.inProduction ?? 0) > 0) {
      return SemesterStatus.IN_PRODUCTION;
    }

    if (Number(counts?.pending ?? 0) === total) {
      return SemesterStatus.PENDING;
    }

    return SemesterStatus.PARTIAL_REVIEW;
  }

  async updateSemesterStatus(
    semesterId: string,
    userId: string,
    manager?: EntityManager,
    knownPreviousStatus?: SemesterStatus,
  ): Promise<SemesterStatus> {
    const semesterRepo = manager ? manager.getRepository(SemesterEntity) : this.semesterRepo;

    const previousStatus =
      knownPreviousStatus ??
      (
        await semesterRepo.findOne({
          where: { id: semesterId },
          select: { id: true, status: true },
        })
      )?.status;

    if (!previousStatus) {
      throw new Error(`Semester ${semesterId} not found`);
    }

    const nextStatus = await this.deriveSemesterStatus(semesterId, manager);

    if (previousStatus !== nextStatus) {
      await semesterRepo.update({ id: semesterId }, { status: nextStatus });

      await this.statusHistoryService.recordIfChanged(
        {
          entityType: 'SEMESTER',
          entityId: semesterId,
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
