import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, QueryDeepPartialEntity, Repository } from 'typeorm';
import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { ProjectInstitutionalState } from '../common/enums/project-institutional-state.enum';
import { SubjectStatus } from '../common/enums/subject-status.enum';
import { isInstitutionalWorkflowEnabled } from '../institutional-workflow/institutional-workflow.config';
import { ObservationsService } from '../observations/observations.service';
import { ProjectEntity } from '../projects/project.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import {
  ProjectRadicationReadinessDto,
  RadicationScopeSemesterDto,
} from './dto/project-radication-readiness.dto';

const ACTIVE_SUBJECT_STATES: InstitutionalOperationalState[] = [
  InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION,
  InstitutionalOperationalState.RETURNED_TO_PRODUCT_FROM_PLANNING,
  InstitutionalOperationalState.PENDING_FACTORY,
  InstitutionalOperationalState.IN_FACTORY_PRODUCTION,
  InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION,
  InstitutionalOperationalState.RETURNED_TO_FACTORY_FROM_PLANNING,
  InstitutionalOperationalState.PENDING_LMS_UPLOAD,
  InstitutionalOperationalState.IN_LMS_UPLOAD,
  InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION,
  InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING,
  InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW,
  InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW,
  InstitutionalOperationalState.CHANGES_REQUESTED_BY_PRODUCT,
];

@Injectable()
export class ProjectRadicationReadinessService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(SemesterEntity)
    private readonly semesterRepo: Repository<SemesterEntity>,
    @Inject(forwardRef(() => ObservationsService))
    private readonly observationsService: ObservationsService,
  ) {}

  usesProjectRadication(project: Pick<ProjectEntity, 'legacyWorkflow'>): boolean {
    return isInstitutionalWorkflowEnabled() && !project.legacyWorkflow;
  }

  async getReadiness(projectId: string, manager?: EntityManager): Promise<ProjectRadicationReadinessDto> {
    const projectRepository = manager?.getRepository(ProjectEntity) ?? this.projectRepo;
    const subjectRepository = manager?.getRepository(SubjectEntity) ?? this.subjectRepo;
    const semesterRepository = manager?.getRepository(SemesterEntity) ?? this.semesterRepo;

    const project = await projectRepository.findOne({
      where: { id: projectId, deletedAt: IsNull() },
      relations: { productOwner: true },
    });
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado');
    }

    if (!this.usesProjectRadication(project)) {
      return {
        ready: false,
        blockers: ['Flujo institucional no activo en este proyecto'],
        scope: { semesters: 0, subjectsTotal: 0, subjectsApproved: 0, subjectsPending: 0 },
        bySemester: [],
        canRegisterRadication: false,
        canResubmitRadication: false,
        projectInstitutionalState: null,
        institutionalScopeLockedAt: null,
        radicationNumber: null,
        radicatedAt: null,
        lastRadicationReturnReason: null,
        productRadicationDueAt: null,
        planningRadicationCheckDueAt: null,
      };
    }

    const scopeSemesters = await semesterRepository
      .createQueryBuilder('sem')
      .leftJoinAndSelect(
        'sem.subjects',
        'subject',
        'subject.deletedAt IS NULL AND subject.created_from_change = false',
      )
      .where('sem.projectId = :projectId', { projectId })
      .andWhere('sem.deletedAt IS NULL')
      .andWhere('sem.created_from_change = false')
      .orderBy('sem.semesterNumber', 'ASC')
      .getMany();

    const scopeSubjects = await subjectRepository
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.semester', 'sem')
      .where('s.projectId = :projectId', { projectId })
      .andWhere('s.deletedAt IS NULL')
      .andWhere('sem.deletedAt IS NULL')
      .andWhere('sem.createdFromChange = false')
      .andWhere('s.createdFromChange = false')
      .getMany();

    const blockers: string[] = [];
    const bySemesterMap = new Map<number, RadicationScopeSemesterDto>();

    let subjectsApproved = 0;
    let subjectsPending = 0;

    for (const semester of scopeSemesters) {
      bySemesterMap.set(semester.semesterNumber, {
        semesterNumber: semester.semesterNumber,
        total: semester.subjects?.length ?? 0,
        approved: 0,
        pending: 0,
        statesBreakdown: { [semester.operationalState]: 1 },
      });
      const semesterReady =
        semester.operationalState === InstitutionalOperationalState.PENDING_PROJECT_RADICATION ||
        semester.operationalState === InstitutionalOperationalState.FINALIZED;
      if (!semesterReady) {
        blockers.push(
          `Semestre ${semester.semesterNumber} aun en flujo operacional (${semester.operationalState})`,
        );
      }
    }

    for (const subject of scopeSubjects) {
      const semNum = subject.semester.semesterNumber;
      if (!bySemesterMap.has(semNum)) {
        bySemesterMap.set(semNum, {
          semesterNumber: semNum,
          total: 0,
          approved: 0,
          pending: 0,
          statesBreakdown: {},
        });
      }
      const row = bySemesterMap.get(semNum)!;
      row.total += 1;
      const stateKey = subject.operationalState;
      row.statesBreakdown[stateKey] = (row.statesBreakdown[stateKey] ?? 0) + 1;

      const isApprovedSubject =
        subject.operationalState === InstitutionalOperationalState.FINALIZED ||
        (subject.operationalState === InstitutionalOperationalState.PENDING_PROJECT_RADICATION &&
          subject.status === SubjectStatus.APPROVED);

      if (isApprovedSubject) {
        subjectsApproved += 1;
        row.approved += 1;
      } else if (subject.operationalState !== InstitutionalOperationalState.FINALIZED) {
        subjectsPending += 1;
        row.pending += 1;
      }

      if (ACTIVE_SUBJECT_STATES.includes(subject.operationalState)) {
        blockers.push(`"${subject.name}" aún en flujo operacional (${subject.operationalState})`);
      }

      if (
        subject.operationalState === InstitutionalOperationalState.PENDING_PROJECT_RADICATION &&
        subject.status !== SubjectStatus.APPROVED
      ) {
        blockers.push(`"${subject.name}" pendiente de aprobación académica`);
      }

      const obsManager = manager ?? this.subjectRepo.manager;
      if (await this.observationsService.hasBlockingObservationsForSubject(subject.id, obsManager)) {
        blockers.push(`"${subject.name}" tiene observaciones bloqueantes`);
      }
      if (await this.observationsService.hasUnresolvedObservationsForSubject(subject.id, obsManager)) {
        blockers.push(`"${subject.name}" tiene observaciones sin resolver`);
      }
    }

    if (scopeSemesters.length === 0 || scopeSubjects.length === 0) {
      blockers.push('No hay materias en el alcance inicial de radicación');
    }

    const allReady =
      scopeSemesters.length > 0 &&
      scopeSemesters.every(
        (s) =>
          s.operationalState === InstitutionalOperationalState.PENDING_PROJECT_RADICATION &&
          s.subjects.every((subject) => subject.status === SubjectStatus.APPROVED),
      ) &&
      blockers.length === 0;

    const uniqueBlockers = [...new Set(blockers)];

    if (project.institutionalState === ProjectInstitutionalState.FINALIZED && scopeSubjects.length > 0) {
      subjectsApproved = scopeSubjects.length;
      subjectsPending = 0;
      for (const row of bySemesterMap.values()) {
        row.approved = row.total;
        row.pending = 0;
      }
    }

    const canRegisterRadication =
      allReady &&
      project.institutionalState === ProjectInstitutionalState.READY_FOR_PRODUCT_RADICATION;

    const canResubmitRadication =
      project.institutionalState === ProjectInstitutionalState.RADICATION_RETURNED_TO_PRODUCT;

    const semesterNumbers = [...bySemesterMap.keys()].sort((a, b) => a - b);

    return {
      ready: allReady,
      blockers: uniqueBlockers,
      scope: {
        semesters: semesterNumbers.length,
        subjectsTotal: scopeSubjects.length,
        subjectsApproved,
        subjectsPending,
      },
      bySemester: semesterNumbers.map((n) => bySemesterMap.get(n)!),
      canRegisterRadication,
      canResubmitRadication,
      projectInstitutionalState: project.institutionalState,
      institutionalScopeLockedAt: project.institutionalScopeLockedAt,
      radicationNumber: project.radicationNumber,
      radicatedAt: project.radicatedAt,
      lastRadicationReturnReason: project.lastRadicationReturnReason,
      productRadicationDueAt: project.productRadicationDueAt,
      planningRadicationCheckDueAt: project.planningRadicationCheckDueAt,
    };
  }

  async recalculateAndUpdateProjectState(
    projectId: string,
    manager: EntityManager,
    actorId?: string,
  ): Promise<void> {
    const projectRepository = manager.getRepository(ProjectEntity);
    const project = await projectRepository.findOne({
      where: { id: projectId, deletedAt: IsNull() },
    });
    if (!project || !this.usesProjectRadication(project)) return;

    if (
      project.institutionalState === ProjectInstitutionalState.FINALIZED ||
      project.institutionalState === ProjectInstitutionalState.PENDING_PLANNING_RADICATION_CHECK ||
      project.institutionalState === ProjectInstitutionalState.RADICATION_RETURNED_TO_PRODUCT
    ) {
      return;
    }

    const readiness = await this.getReadiness(projectId, manager);

    if (readiness.ready) {
      const now = new Date();
      const productDays = this.productRadicationBusinessDays();
      const updates: QueryDeepPartialEntity<ProjectEntity> = {
        institutionalState: ProjectInstitutionalState.READY_FOR_PRODUCT_RADICATION,
        readyForRadicationAt: project.readyForRadicationAt ?? now,
        productRadicationDueAt:
          project.productRadicationDueAt ??
          this.addBusinessDays(project.readyForRadicationAt ?? now, productDays),
      };
      await projectRepository.update({ id: projectId }, updates);

      if (
        project.institutionalState !== ProjectInstitutionalState.READY_FOR_PRODUCT_RADICATION &&
        project.productOwner?.id
      ) {
        // Notification handled by caller via ProjectInstitutionalWorkflowService
      }
    } else if (
      project.institutionalState === ProjectInstitutionalState.READY_FOR_PRODUCT_RADICATION
    ) {
      await projectRepository.update(
        { id: projectId },
        { institutionalState: ProjectInstitutionalState.INSTITUTIONAL_IN_PROGRESS },
      );
    } else if (!project.institutionalState) {
      await projectRepository.update(
        { id: projectId },
        { institutionalState: ProjectInstitutionalState.INSTITUTIONAL_IN_PROGRESS },
      );
    }
  }

  private productRadicationBusinessDays(): number {
    const raw = process.env.PRODUCT_RADICATION_BUSINESS_DAYS;
    const n = raw ? Number(raw) : 5;
    return Number.isInteger(n) && n > 0 ? n : 5;
  }

  private addBusinessDays(from: Date, days: number): Date {
    const result = new Date(from);
    let added = 0;
    while (added < days) {
      result.setDate(result.getDate() + 1);
      const dow = result.getDay();
      if (dow !== 0 && dow !== 6) added += 1;
    }
    return result;
  }
}
