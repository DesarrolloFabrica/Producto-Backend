import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { SemesterStatus } from '../common/enums/semester-status.enum';
import { SubjectStatus } from '../common/enums/subject-status.enum';
import { StatusHistoryService } from '../audit/status-history.service';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectEntity } from '../subjects/subject.entity';

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

    const subjects = await subjectRepo.find({
      where: { semester: { id: semesterId }, deletedAt: IsNull() },
    });

    if (subjects.length === 0) {
      return SemesterStatus.PENDING;
    }

    if (subjects.some((s) => s.status === SubjectStatus.CHANGES_REQUESTED)) {
      return SemesterStatus.CHANGES_REQUESTED;
    }

    if (subjects.every((s) => s.status === SubjectStatus.APPROVED)) {
      return SemesterStatus.APPROVED;
    }

    if (
      subjects.some(
        (s) => s.status === SubjectStatus.IN_REVIEW || s.status === SubjectStatus.SUBMITTED,
      )
    ) {
      return SemesterStatus.PARTIAL_REVIEW;
    }

    if (subjects.some((s) => s.status === SubjectStatus.IN_PRODUCTION)) {
      return SemesterStatus.IN_PRODUCTION;
    }

    if (subjects.every((s) => s.status === SubjectStatus.PENDING)) {
      return SemesterStatus.PENDING;
    }

    return SemesterStatus.PARTIAL_REVIEW;
  }

  async updateSemesterStatus(
    semesterId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<SemesterEntity> {
    const semesterRepo = manager ? manager.getRepository(SemesterEntity) : this.semesterRepo;
    const semester = await semesterRepo.findOne({ where: { id: semesterId } });

    if (!semester) {
      throw new Error(`Semester ${semesterId} not found`);
    }

    const nextStatus = await this.deriveSemesterStatus(semesterId, manager);
    const previousStatus = semester.status;

    if (previousStatus !== nextStatus) {
      semester.status = nextStatus;
      await semesterRepo.save(semester);

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

    return semester;
  }
}
