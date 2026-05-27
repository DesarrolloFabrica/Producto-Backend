import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AuditAction } from '../common/enums/audit-action.enum';
import { InstitutionalOperationalAction } from '../common/enums/institutional-operational-action.enum';
import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { NotificationEventType } from '../common/enums/notification-event-type.enum';
import { NotificationType } from '../common/enums/notification-type.enum';
import { OperationalCheckKey, OperationalCheckStatus } from '../common/enums/operational-check-key.enum';
import { SubjectStatus } from '../common/enums/subject-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ObservationsService } from '../observations/observations.service';
import { ProjectInstitutionalWorkflowService } from '../project-radication/project-institutional-workflow.service';
import { SemesterEntity } from '../semesters/semester.entity';
import { FactoryProductionStatus } from '../common/enums/factory-production-status.enum';
import { isSubjectFactoryProductionComplete } from '../subjects/factory-production.util';
import { SubjectEntity } from '../subjects/subject.entity';
import { SubjectsService } from '../subjects/subjects.service';
import { UserEntity } from '../users/user.entity';
import { OperationalTransitionDto } from './dto/operational-transition.dto';
import {
  OperationalCheckDto,
  OperationalTransitionRecordDto,
} from './dto/operational-workspace.dto';
import {
  allowedActionsForRole,
  isAcademicChecklistEditable,
  isAcademicReviewReady,
  isCorrectionInFactory,
  isReturnAction,
  isSemesterProductAcademicReviewPhase,
  resolveNextInstitutionalState,
  responsibleRoleForState,
  statesPendingForRole,
} from './institutional-workflow.transitions';
import { OPERATIONAL_CHECK_DEFINITIONS } from './institutional-workflow.constants';
import { InstitutionalWorkflowSlaService } from './institutional-workflow-sla.service';
import { ProgramOperationalWorkItemDto } from './dto/program-operational-work-item.dto';
import { aggregateSemestersToPrograms } from './program-operational-aggregator';
import { SemesterOperationalCheckEntity } from './semester-operational-check.entity';
import { SemesterOperationalTransitionEntity } from './semester-operational-transition.entity';

const STATE_ORDER: InstitutionalOperationalState[] = [
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
  InstitutionalOperationalState.PENDING_PROJECT_RADICATION,
  InstitutionalOperationalState.FINALIZED,
];

interface SemesterSubjectSummary {
  subjectId: string;
  subjectName: string;
  status: SubjectStatus;
  operationalState: InstitutionalOperationalState;
  internalState: string;
  progress: number;
  blockers: string[];
  openObservationsCount: number;
}

export interface SemesterOperationalWorkspaceDto {
  semesterId: string;
  semesterNumber: number;
  projectId: string;
  program: string;
  school: string;
  operationalState: InstitutionalOperationalState;
  currentResponsibleRole: UserRole;
  academicReviewEnabled: boolean;
  academicChecklistEnabled: boolean;
  academicReviewReady: boolean;
  correctionInFactory: boolean;
  institutionalFlowActive: boolean;
  slaStatus: string;
  stageDueAt: Date | null;
  lastReturnReason: string | null;
  lastReturnAt: Date | null;
  checks: OperationalCheckDto[];
  timeline: OperationalTransitionRecordDto[];
  availableActions: InstitutionalOperationalAction[];
  readiness: { ready: boolean; blockers: string[] };
  subjects: SemesterSubjectSummary[];
  metrics: {
    subjectsTotal: number;
    subjectsReady: number;
    subjectsApproved: number;
    subjectsBlocked: number;
    openObservations: number;
  };
}

export interface SemesterOperationalWorkItemDto {
  kind: 'semester';
  semesterId: string;
  semesterNumber: number;
  subjectId: string;
  subjectName: string;
  projectId: string;
  program: string;
  school: string;
  operationalState: InstitutionalOperationalState;
  currentResponsibleRole: UserRole;
  stageDueAt: Date | null;
  slaStatus: string;
  availableActions: InstitutionalOperationalAction[];
  lastReturnReason: string | null;
  actionUrl: string;
  subjectsTotal: number;
  subjectsReady: number;
  openObservations: number;
}

@Injectable()
export class SemesterOperationalWorkflowService {
  constructor(
    @InjectRepository(SemesterEntity)
    private readonly semesterRepo: Repository<SemesterEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(SemesterOperationalCheckEntity)
    private readonly checkRepo: Repository<SemesterOperationalCheckEntity>,
    @InjectRepository(SemesterOperationalTransitionEntity)
    private readonly transitionRepo: Repository<SemesterOperationalTransitionEntity>,
    private readonly slaService: InstitutionalWorkflowSlaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => SubjectsService))
    private readonly subjectsService: SubjectsService,
    @Inject(forwardRef(() => ObservationsService))
    private readonly observationsService: ObservationsService,
    @Inject(forwardRef(() => ProjectInstitutionalWorkflowService))
    private readonly projectRadicationWorkflow: ProjectInstitutionalWorkflowService,
  ) {}

  async initializeSemesterOperational(
    semesterId: string,
    manager: EntityManager,
    actor: UserEntity,
  ): Promise<void> {
    const semesterRepo = manager.getRepository(SemesterEntity);
    const checkRepo = manager.getRepository(SemesterOperationalCheckEntity);
    const transitionRepo = manager.getRepository(SemesterOperationalTransitionEntity);
    const now = new Date();
    const initial = InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION;
    await semesterRepo.update(semesterId, {
      operationalState: initial,
      operationalStageEnteredAt: now,
      operationalStageDueAt: this.slaService.computeStageDueAt(now, initial),
      lockVersion: 0,
    });
    await checkRepo.save(
      OPERATIONAL_CHECK_DEFINITIONS.map((def) =>
        checkRepo.create({
          semester: { id: semesterId },
          checkKey: def.key,
          label: def.label,
          status: OperationalCheckStatus.PENDING,
        }),
      ),
    );
    await transitionRepo.save(transitionRepo.create({
      semester: { id: semesterId },
      fromState: null,
      toState: initial,
      action: InstitutionalOperationalAction.INSTITUTIONAL_SUBJECT_CREATED,
      actor: { id: actor.id },
      actorRole: actor.role,
      comment: 'Semestre creado',
    }));
  }

  /** Alinea operational_state de materias con el semestre (flujo semester-first). */
  async syncSubjectsOperationalStateFromSemester(
    semesterId: string,
    manager: EntityManager,
  ): Promise<void> {
    const semesterRepo = manager.getRepository(SemesterEntity);
    const subjectRepo = manager.getRepository(SubjectEntity);
    const semester = await semesterRepo.findOne({
      where: { id: semesterId, deletedAt: IsNull() },
    });
    if (!semester?.operationalState) return;
    await subjectRepo.update(
      { semester: { id: semesterId }, deletedAt: IsNull() },
      {
        operationalState: semester.operationalState,
        operationalStageEnteredAt: semester.operationalStageEnteredAt,
        operationalStageDueAt: semester.operationalStageDueAt,
      },
    );
  }

  async transition(
    semesterId: string,
    dto: OperationalTransitionDto,
    user: UserEntity,
  ): Promise<SemesterOperationalWorkspaceDto> {
    const semester = await this.loadSemester(semesterId);
    this.assertAccess(semester, user);
    if (user.role !== UserRole.ADMIN) {
      const allowed = allowedActionsForRole(user.role, semester.operationalState);
      if (!allowed.includes(dto.action)) throw new ForbiddenException('Accion no permitida para su rol en este estado');
    }
    if (isReturnAction(dto.action) && (dto.returnReason ?? dto.comment ?? '').trim().length < 10) {
      throw new BadRequestException('Debe indicar un motivo de devolucion (minimo 10 caracteres)');
    }

    await this.semesterRepo.manager.transaction(async (manager) => {
      await this.applyTransitionInManager(manager, semesterId, dto, user);
    });
    return this.getWorkspace(semesterId, user);
  }

  async applyTransitionInManager(
    manager: EntityManager,
    semesterId: string,
    dto: OperationalTransitionDto,
    user: UserEntity,
  ): Promise<void> {
    const semesterRepo = manager.getRepository(SemesterEntity);
    const subjectRepo = manager.getRepository(SubjectEntity);
    const fresh = await semesterRepo.findOne({
      where: { id: semesterId, deletedAt: IsNull() },
      relations: { project: { productOwner: true, factoryOwner: true }, subjects: true },
    });
    if (!fresh) throw new NotFoundException('Semestre no encontrado');

    const fromState = fresh.operationalState;
    const next = resolveNextInstitutionalState({ current: fromState, action: dto.action });
    if (!next) throw new BadRequestException('Transicion no valida para el estado actual');

    await this.assertReadyForAction(fresh, dto.action, user, manager);

    const now = new Date();
    const update: QueryDeepPartialEntity<SemesterEntity> = {
      operationalState: next,
      operationalStageEnteredAt: now,
      operationalStageDueAt: this.slaService.computeStageDueAt(now, next),
      operationalFinalizedAt: next === InstitutionalOperationalState.FINALIZED ? now : fresh.operationalFinalizedAt,
      lastReturnReason: isReturnAction(dto.action) ? (dto.returnReason ?? dto.comment ?? '').trim() : null,
      lastReturnAt: isReturnAction(dto.action) ? now : null,
      lastReturnBy: isReturnAction(dto.action) ? { id: user.id } : null,
      lockVersion: fresh.lockVersion + 1,
    };

    const result = await semesterRepo.update(
      { id: semesterId, operationalState: fromState, lockVersion: fresh.lockVersion },
      update,
    );
    if (!result.affected) throw new ConflictException('El estado operacional del semestre cambio. Recargue e intente de nuevo.');

    await subjectRepo.update(
      { semester: { id: semesterId } },
      {
        operationalState: next,
        operationalStageEnteredAt: now,
        operationalStageDueAt: this.slaService.computeStageDueAt(now, next),
        lastReturnReason: update.lastReturnReason,
        lastReturnAt: update.lastReturnAt,
        lastReturnBy: isReturnAction(dto.action) ? { id: user.id } : null,
      },
    );
    await this.syncSubjectAcademicStatus(semesterId, dto.action, manager);
    await this.markOperationalCheck(semesterId, next, user, dto, manager);
    await this.recordTransition(semesterId, fromState, next, dto, user, manager);
    await this.dispatchSideEffects(fresh, dto, user, manager);
    await this.auditService.createLog({
      entityType: 'SEMESTER',
      entityId: semesterId,
      action: AuditAction.STATUS_CHANGE,
      userId: user.id,
      beforeJson: { operationalState: fromState },
      afterJson: { operationalState: next, action: dto.action },
    }, manager);

    if (dto.action === InstitutionalOperationalAction.PLANNING_VALIDATE_INITIAL) {
      await this.projectRadicationWorkflow.lockScopeIfNeeded(fresh.project.id, manager);
    }
    if (dto.action === InstitutionalOperationalAction.PRODUCT_APPROVE_ACADEMIC) {
      await this.projectRadicationWorkflow.onSubjectApprovedForRadication(fresh.project.id, manager, user);
    }
  }

  async getWorkspace(semesterId: string, user: UserEntity): Promise<SemesterOperationalWorkspaceDto> {
    const semester = await this.loadSemester(semesterId);
    this.assertAccess(semester, user);
    await this.ensureChecks(semesterId);
    const [checks, timeline, subjects, openObservations] = await Promise.all([
      this.checkRepo.find({ where: { semester: { id: semesterId } }, relations: { checkedBy: true }, order: { checkKey: 'ASC' } }),
      this.transitionRepo.find({ where: { semester: { id: semesterId } }, relations: { actor: true }, order: { createdAt: 'ASC' } }),
      this.loadSubjectSummaries(semesterId, user, semester.operationalState),
      this.countOpenObservations(semesterId),
    ]);
    const readiness = await this.computeReadiness(semester, null, user);
    const availableActions = user.role === UserRole.ADMIN
      ? [
          ...allowedActionsForRole(UserRole.PLANEACION, semester.operationalState),
          ...allowedActionsForRole(UserRole.FABRICA, semester.operationalState),
          ...allowedActionsForRole(UserRole.LMS, semester.operationalState),
          ...allowedActionsForRole(UserRole.PRODUCT, semester.operationalState),
        ]
      : allowedActionsForRole(user.role, semester.operationalState);
    const filteredActions = [...new Set(availableActions)].filter((a) => {
      if (
        a === InstitutionalOperationalAction.PRODUCT_APPROVE_ACADEMIC ||
        a === InstitutionalOperationalAction.FACTORY_DELIVER_CONTENT
      ) {
        return readiness.ready;
      }
      return true;
    });
    const subjectsReady = await this.countFactoryProductionReadySubjects(semesterId);
    return {
      semesterId: semester.id,
      semesterNumber: semester.semesterNumber,
      projectId: semester.project.id,
      program: semester.project.program,
      school: semester.project.school,
      operationalState: semester.operationalState,
      currentResponsibleRole: responsibleRoleForState(semester.operationalState),
      academicReviewEnabled: isAcademicChecklistEditable(semester.operationalState) || isAcademicReviewReady(semester.operationalState),
      academicChecklistEnabled: isAcademicChecklistEditable(semester.operationalState),
      academicReviewReady: isAcademicReviewReady(semester.operationalState),
      correctionInFactory: isCorrectionInFactory(semester.operationalState),
      institutionalFlowActive: !semester.project.legacyWorkflow,
      slaStatus: this.slaService.computeSlaStatus({
        state: semester.operationalState,
        stageEnteredAt: semester.operationalStageEnteredAt,
        stageDueAt: semester.operationalStageDueAt,
        finalizedAt: semester.operationalFinalizedAt,
      }),
      stageDueAt: semester.operationalStageDueAt,
      lastReturnReason: semester.lastReturnReason,
      lastReturnAt: semester.lastReturnAt,
      checks: checks.map((c) => this.mapCheck(c)),
      timeline: timeline.map((t) => this.mapTransition(t)),
      availableActions: filteredActions,
      readiness,
      subjects,
      metrics: {
        subjectsTotal: subjects.length,
        subjectsReady,
        subjectsApproved: subjects.filter((s) => s.status === SubjectStatus.APPROVED).length,
        subjectsBlocked: subjects.filter((s) => s.blockers.length > 0).length,
        openObservations,
      },
    };
  }

  private static readonly PLANNING_TRACKING_STATES: InstitutionalOperationalState[] = [
    InstitutionalOperationalState.PENDING_FACTORY,
    InstitutionalOperationalState.IN_FACTORY_PRODUCTION,
    InstitutionalOperationalState.RETURNED_TO_FACTORY_FROM_PLANNING,
    InstitutionalOperationalState.PENDING_LMS_UPLOAD,
    InstitutionalOperationalState.IN_LMS_UPLOAD,
    InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING,
    InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW,
    InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW,
    InstitutionalOperationalState.CHANGES_REQUESTED_BY_PRODUCT,
    InstitutionalOperationalState.PENDING_PROJECT_RADICATION,
    InstitutionalOperationalState.RETURNED_TO_PRODUCT_FROM_PLANNING,
  ];

  async listTrackingForPlanning(user: UserEntity): Promise<SemesterOperationalWorkItemDto[]> {
    if (user.role !== UserRole.PLANEACION && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Solo Planeacion puede consultar seguimiento');
    }
    const semesters = await this.semesterRepo
      .createQueryBuilder('sem')
      .innerJoinAndSelect('sem.project', 'p')
      .leftJoinAndSelect('sem.subjects', 'subjects', 'subjects.deletedAt IS NULL')
      .where('sem.deletedAt IS NULL')
      .andWhere('p.deletedAt IS NULL')
      .andWhere('p.legacyWorkflow = false')
      .andWhere('sem.operational_state IN (:...states)', {
        states: SemesterOperationalWorkflowService.PLANNING_TRACKING_STATES,
      })
      .orderBy('sem.updatedAt', 'DESC')
      .getMany();

    return Promise.all(
      semesters.map(async (s) => {
        const openObservations = await this.countOpenObservations(s.id);
        const ready = await this.countFactoryProductionReadySubjects(s.id);
        const firstSubject = s.subjects?.[0];
        return {
          kind: 'semester',
          semesterId: s.id,
          semesterNumber: s.semesterNumber,
          subjectId: firstSubject?.id ?? s.id,
          subjectName: `Semestre ${s.semesterNumber}`,
          projectId: s.project.id,
          program: s.project.program,
          school: s.project.school,
          operationalState: s.operationalState,
          currentResponsibleRole: responsibleRoleForState(s.operationalState),
          stageDueAt: s.operationalStageDueAt,
          slaStatus: this.slaService.computeSlaStatus({
            state: s.operationalState,
            stageEnteredAt: s.operationalStageEnteredAt,
            stageDueAt: s.operationalStageDueAt,
            finalizedAt: s.operationalFinalizedAt,
          }),
          availableActions: [],
          lastReturnReason: s.lastReturnReason,
          actionUrl: `/projects/${s.project.id}/semesters/${s.id}/operations`,
          subjectsTotal: s.subjects?.length ?? 0,
          subjectsReady: ready,
          openObservations,
        };
      }),
    );
  }

  async listWorkForRole(user: UserEntity): Promise<SemesterOperationalWorkItemDto[]> {
    const states = user.role === UserRole.ADMIN
      ? [...new Set([
          ...statesPendingForRole(UserRole.PLANEACION),
          ...statesPendingForRole(UserRole.FABRICA),
          ...statesPendingForRole(UserRole.LMS),
          ...statesPendingForRole(UserRole.PRODUCT),
        ])]
      : statesPendingForRole(user.role);
    const qb = this.semesterRepo.createQueryBuilder('sem')
      .innerJoinAndSelect('sem.project', 'p')
      .leftJoinAndSelect('sem.subjects', 'subjects', 'subjects.deletedAt IS NULL')
      .where('sem.deletedAt IS NULL')
      .andWhere('p.deletedAt IS NULL')
      .andWhere('p.legacyWorkflow = false')
      .andWhere('sem.operational_state IN (:...states)', { states });
    if (user.role === UserRole.PRODUCT) qb.andWhere('p.productOwnerId = :userId', { userId: user.id });
    if (user.role === UserRole.FABRICA) qb.andWhere('(p.factoryOwnerId = :userId OR p.factoryOwnerId IS NULL)', { userId: user.id });
    const semesters = await qb.orderBy('sem.operational_stage_due_at', 'ASC', 'NULLS LAST').addOrderBy('sem.updatedAt', 'DESC').getMany();
    return Promise.all(semesters.map(async (s) => {
      const openObservations = await this.countOpenObservations(s.id);
      const ready = await this.countFactoryProductionReadySubjects(s.id);
      const firstSubject = s.subjects?.[0];
      const actions = user.role === UserRole.ADMIN
        ? allowedActionsForRole(responsibleRoleForState(s.operationalState), s.operationalState)
        : allowedActionsForRole(user.role, s.operationalState);
      return {
        kind: 'semester',
        semesterId: s.id,
        semesterNumber: s.semesterNumber,
        subjectId: firstSubject?.id ?? s.id,
        subjectName: `Semestre ${s.semesterNumber}`,
        projectId: s.project.id,
        program: s.project.program,
        school: s.project.school,
        operationalState: s.operationalState,
        currentResponsibleRole: responsibleRoleForState(s.operationalState),
        stageDueAt: s.operationalStageDueAt,
        slaStatus: this.slaService.computeSlaStatus({
          state: s.operationalState,
          stageEnteredAt: s.operationalStageEnteredAt,
          stageDueAt: s.operationalStageDueAt,
          finalizedAt: s.operationalFinalizedAt,
        }),
        availableActions: actions,
        lastReturnReason: s.lastReturnReason,
        actionUrl: `/projects/${s.project.id}/semesters/${s.id}/operations`,
        subjectsTotal: s.subjects?.length ?? 0,
        subjectsReady: ready,
        openObservations,
      };
    }));
  }

  async listProgramsForRole(user: UserEntity): Promise<ProgramOperationalWorkItemDto[]> {
    const semesters = await this.listWorkForRole(user);
    return aggregateSemestersToPrograms(semesters);
  }

  async getProgramOperationsForProject(
    user: UserEntity,
    projectId: string,
  ): Promise<ProgramOperationalWorkItemDto> {
    const semesters = await this.semesterRepo
      .createQueryBuilder('sem')
      .innerJoinAndSelect('sem.project', 'p')
      .leftJoinAndSelect('sem.subjects', 'subjects', 'subjects.deletedAt IS NULL')
      .leftJoinAndSelect('p.productOwner', 'productOwner')
      .leftJoinAndSelect('p.factoryOwner', 'factoryOwner')
      .where('sem.deletedAt IS NULL')
      .andWhere('p.deletedAt IS NULL')
      .andWhere('p.legacyWorkflow = false')
      .andWhere('p.id = :projectId', { projectId })
      .orderBy('sem.semesterNumber', 'ASC')
      .getMany();

    if (!semesters.length) {
      throw new NotFoundException('Programa no encontrado');
    }

    this.assertAccess(semesters[0]!, user);

    const items = await Promise.all(
      semesters.map(async (s) => this.buildSemesterWorkItem(s, user)),
    );
    const program = aggregateSemestersToPrograms(items).find((p) => p.projectId === projectId);
    if (!program) {
      throw new NotFoundException('Programa no encontrado');
    }
    return program;
  }

  private async buildSemesterWorkItem(
    s: SemesterEntity,
    user: UserEntity,
  ): Promise<SemesterOperationalWorkItemDto> {
    const openObservations = await this.countOpenObservations(s.id);
    const ready = await this.countFactoryProductionReadySubjects(s.id);
    const firstSubject = s.subjects?.[0];
    const actions =
      user.role === UserRole.ADMIN
        ? allowedActionsForRole(responsibleRoleForState(s.operationalState), s.operationalState)
        : allowedActionsForRole(user.role, s.operationalState);
    return {
      kind: 'semester',
      semesterId: s.id,
      semesterNumber: s.semesterNumber,
      subjectId: firstSubject?.id ?? s.id,
      subjectName: `Semestre ${s.semesterNumber}`,
      projectId: s.project.id,
      program: s.project.program,
      school: s.project.school,
      operationalState: s.operationalState,
      currentResponsibleRole: responsibleRoleForState(s.operationalState),
      stageDueAt: s.operationalStageDueAt,
      slaStatus: this.slaService.computeSlaStatus({
        state: s.operationalState,
        stageEnteredAt: s.operationalStageEnteredAt,
        stageDueAt: s.operationalStageDueAt,
        finalizedAt: s.operationalFinalizedAt,
      }),
      availableActions: actions,
      lastReturnReason: s.lastReturnReason,
      actionUrl: `/projects/${s.project.id}/semesters/${s.id}/operations`,
      subjectsTotal: s.subjects?.length ?? 0,
      subjectsReady: ready,
      openObservations,
    };
  }

  async listProgramsTrackingForPlanning(user: UserEntity): Promise<ProgramOperationalWorkItemDto[]> {
    const semesters = await this.listTrackingForPlanning(user);
    return aggregateSemestersToPrograms(semesters);
  }

  async listTrackingForProduct(user: UserEntity): Promise<SemesterOperationalWorkItemDto[]> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Solo Product puede consultar seguimiento');
    }
    const qb = this.semesterRepo
      .createQueryBuilder('sem')
      .innerJoinAndSelect('sem.project', 'p')
      .leftJoinAndSelect('sem.subjects', 'subjects', 'subjects.deletedAt IS NULL')
      .where('sem.deletedAt IS NULL')
      .andWhere('p.deletedAt IS NULL')
      .andWhere('p.legacyWorkflow = false')
      .andWhere('sem.operational_state <> :finalized', {
        finalized: InstitutionalOperationalState.FINALIZED,
      });
    if (user.role === UserRole.PRODUCT) {
      qb.andWhere('p.productOwnerId = :userId', { userId: user.id });
    }
    const semesters = await qb
      .orderBy('sem.operational_stage_due_at', 'ASC', 'NULLS LAST')
      .addOrderBy('sem.updatedAt', 'DESC')
      .getMany();

    return Promise.all(
      semesters.map(async (s) => {
        const openObservations = await this.countOpenObservations(s.id);
        const ready = await this.countFactoryProductionReadySubjects(s.id);
        const firstSubject = s.subjects?.[0];
        return {
          kind: 'semester' as const,
          semesterId: s.id,
          semesterNumber: s.semesterNumber,
          subjectId: firstSubject?.id ?? s.id,
          subjectName: `Semestre ${s.semesterNumber}`,
          projectId: s.project.id,
          program: s.project.program,
          school: s.project.school,
          operationalState: s.operationalState,
          currentResponsibleRole: responsibleRoleForState(s.operationalState),
          stageDueAt: s.operationalStageDueAt,
          slaStatus: this.slaService.computeSlaStatus({
            state: s.operationalState,
            stageEnteredAt: s.operationalStageEnteredAt,
            stageDueAt: s.operationalStageDueAt,
            finalizedAt: s.operationalFinalizedAt,
          }),
          availableActions: [],
          lastReturnReason: s.lastReturnReason,
          actionUrl: `/projects/${s.project.id}/semesters/${s.id}/operations`,
          subjectsTotal: s.subjects?.length ?? 0,
          subjectsReady: ready,
          openObservations,
        };
      }),
    );
  }

  async listProgramsTrackingForProduct(user: UserEntity): Promise<ProgramOperationalWorkItemDto[]> {
    const semesters = await this.listTrackingForProduct(user);
    return aggregateSemestersToPrograms(semesters);
  }

  private async loadSemester(semesterId: string): Promise<SemesterEntity> {
    const semester = await this.semesterRepo.findOne({
      where: { id: semesterId, deletedAt: IsNull() },
      relations: { project: { productOwner: true, factoryOwner: true }, subjects: true },
    });
    if (!semester) throw new NotFoundException('Semestre no encontrado');
    return semester;
  }

  private assertAccess(semester: SemesterEntity, user: UserEntity): void {
    if (user.role === UserRole.ADMIN || user.role === UserRole.PLANEACION || user.role === UserRole.LMS) return;
    if (user.role === UserRole.PRODUCT && semester.project.productOwner?.id !== user.id) throw new ForbiddenException('No tiene permisos sobre este semestre');
    if (user.role === UserRole.FABRICA) {
      const ownerId = semester.project.factoryOwner?.id ?? null;
      if (ownerId && ownerId !== user.id) throw new ForbiddenException('No tiene permisos sobre este semestre');
    }
  }

  private async assertReadyForAction(
    semester: SemesterEntity,
    action: InstitutionalOperationalAction,
    user: UserEntity,
    manager: EntityManager,
  ): Promise<void> {
    if (user.role === UserRole.ADMIN) {
      const reason = '';
      if (action === InstitutionalOperationalAction.FACTORY_DELIVER_CONTENT && reason) return;
    }
    const readiness = await this.computeReadiness(semester, action, user, manager);
    if (!readiness.ready) throw new BadRequestException(readiness.blockers.join('; '));
  }

  private async computeReadiness(
    semester: SemesterEntity,
    action: InstitutionalOperationalAction | null,
    user: UserEntity,
    manager?: EntityManager,
  ): Promise<{ ready: boolean; blockers: string[] }> {
    const subjectRepo = manager?.getRepository(SubjectEntity) ?? this.subjectRepo;
    const subjects = await subjectRepo.find({ where: { semester: { id: semester.id }, deletedAt: IsNull() } });
    const blockers: string[] = [];
    if (subjects.length === 0) blockers.push('El semestre no tiene asignaturas');
    const checkAction = action ?? this.primaryReadinessActionForState(semester.operationalState);
    for (const subject of subjects) {
      if (!subject.name?.trim()) blockers.push(`Asignatura sin nombre en semestre ${semester.semesterNumber}`);
      if (
        checkAction === InstitutionalOperationalAction.FACTORY_DELIVER_CONTENT &&
        !isSubjectFactoryProductionComplete(subject)
      ) {
        blockers.push(`"${subject.name}" no esta producida al 100%`);
      }
      if (checkAction === InstitutionalOperationalAction.LMS_CONFIRM_UPLOAD && subject.progress < 100) {
        blockers.push(`"${subject.name}" no tiene evidencia/carga completa`);
      }
      if (checkAction === InstitutionalOperationalAction.PRODUCT_APPROVE_ACADEMIC) {
        const subjectBlockers = await this.subjectsService.getAcademicApprovalBlockers(subject.id, user);
        subjectBlockers.forEach((b) => blockers.push(`"${subject.name}": ${b}`));
        const obsManager = manager ?? this.semesterRepo.manager;
        if (await this.observationsService.hasBlockingObservationsForSubject(subject.id, obsManager)) {
          blockers.push(`"${subject.name}" tiene observaciones bloqueantes`);
        }
        if (await this.observationsService.hasUnresolvedObservationsForSubject(subject.id, obsManager)) {
          blockers.push(`"${subject.name}" tiene observaciones sin resolver`);
        }
      }
    }
    return { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
  }

  private primaryReadinessActionForState(state: InstitutionalOperationalState): InstitutionalOperationalAction | null {
    if (state === InstitutionalOperationalState.IN_FACTORY_PRODUCTION) return InstitutionalOperationalAction.FACTORY_DELIVER_CONTENT;
    if (state === InstitutionalOperationalState.IN_LMS_UPLOAD) return InstitutionalOperationalAction.LMS_CONFIRM_UPLOAD;
    if (state === InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW) return InstitutionalOperationalAction.PRODUCT_APPROVE_ACADEMIC;
    return null;
  }

  private async syncSubjectAcademicStatus(semesterId: string, action: InstitutionalOperationalAction, manager: EntityManager): Promise<void> {
    const subjectRepo = manager.getRepository(SubjectEntity);
    if (action === InstitutionalOperationalAction.FACTORY_START_PRODUCTION) {
      await subjectRepo.update(
        { semester: { id: semesterId } },
        {
          status: SubjectStatus.IN_PRODUCTION,
          factoryProductionStatus: FactoryProductionStatus.IN_PROGRESS,
        },
      );
    }
    if (action === InstitutionalOperationalAction.PRODUCT_START_ACADEMIC_REVIEW) await subjectRepo.update({ semester: { id: semesterId } }, { status: SubjectStatus.IN_REVIEW });
    if (action === InstitutionalOperationalAction.PRODUCT_REQUEST_CHANGES) await subjectRepo.update({ semester: { id: semesterId } }, { status: SubjectStatus.CHANGES_REQUESTED });
    if (action === InstitutionalOperationalAction.PRODUCT_APPROVE_ACADEMIC) await subjectRepo.update({ semester: { id: semesterId } }, { status: SubjectStatus.APPROVED });
  }

  private async markOperationalCheck(semesterId: string, next: InstitutionalOperationalState, user: UserEntity, dto: OperationalTransitionDto, manager: EntityManager): Promise<void> {
    const key = this.checkKeyForState(next);
    if (!key) return;
    const checkRepo = manager.getRepository(SemesterOperationalCheckEntity);
    const row = await checkRepo.findOne({ where: { semester: { id: semesterId }, checkKey: key } });
    if (!row) return;
    row.status = OperationalCheckStatus.CHECKED;
    row.checkedAt = new Date();
    row.checkedBy = { id: user.id } as UserEntity;
    row.comment = dto.comment ?? row.comment;
    row.evidenceUrl = dto.evidenceUrl ?? row.evidenceUrl;
    await checkRepo.save(row);
  }

  private checkKeyForState(next: InstitutionalOperationalState): OperationalCheckKey | null {
    switch (next) {
      case InstitutionalOperationalState.PENDING_FACTORY: return OperationalCheckKey.PLANNING_INITIAL_VALIDATED;
      case InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION: return OperationalCheckKey.FACTORY_CONTENT_DELIVERED;
      case InstitutionalOperationalState.PENDING_LMS_UPLOAD: return OperationalCheckKey.PLANNING_PRODUCTION_VALIDATED;
      case InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION: return OperationalCheckKey.LMS_UPLOAD_COMPLETED;
      case InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW: return OperationalCheckKey.PLANNING_LMS_VALIDATED;
      case InstitutionalOperationalState.PENDING_PROJECT_RADICATION: return OperationalCheckKey.PRODUCT_ACADEMIC_APPROVED;
      case InstitutionalOperationalState.FINALIZED: return OperationalCheckKey.PLANNING_FINAL_RADICATED;
      default: return null;
    }
  }

  private async recordTransition(semesterId: string, fromState: InstitutionalOperationalState, toState: InstitutionalOperationalState, dto: OperationalTransitionDto, user: UserEntity, manager: EntityManager): Promise<void> {
    await manager.getRepository(SemesterOperationalTransitionEntity).save({
      semester: { id: semesterId },
      fromState,
      toState,
      action: dto.action,
      actor: { id: user.id },
      actorRole: user.role,
      comment: dto.comment ?? null,
      returnReason: isReturnAction(dto.action) ? (dto.returnReason ?? dto.comment ?? null) : null,
      evidenceUrl: dto.evidenceUrl ?? null,
    });
  }

  private async dispatchSideEffects(semester: SemesterEntity, dto: OperationalTransitionDto, user: UserEntity, manager: EntityManager): Promise<void> {
    const title = `Semestre ${semester.semesterNumber}`;
    const url = `/projects/${semester.project.id}/semesters/${semester.id}/operations`;
    const notify = (role: UserRole, message: string, eventType: NotificationEventType) =>
      this.notificationsService.notifyRole(role, {
        type: NotificationType.INFO,
        title,
        message,
        projectId: semester.project.id,
        eventType,
        actionUrl: url,
      }, manager);
    switch (dto.action) {
      case InstitutionalOperationalAction.PLANNING_VALIDATE_INITIAL:
        await notify(UserRole.FABRICA, `Planeacion valido el semestre ${semester.semesterNumber}.`, NotificationEventType.INSTITUTIONAL_PLANNING_VALIDATED_INITIAL);
        break;
      case InstitutionalOperationalAction.FACTORY_DELIVER_CONTENT:
        await notify(UserRole.PLANEACION, `Fabrica finalizo produccion del semestre ${semester.semesterNumber}.`, NotificationEventType.INSTITUTIONAL_FACTORY_DELIVERED);
        break;
      case InstitutionalOperationalAction.PLANNING_VALIDATE_PRODUCTION:
        await notify(UserRole.LMS, `Planeacion valido produccion del semestre ${semester.semesterNumber}.`, NotificationEventType.INSTITUTIONAL_PLANNING_VALIDATED_PRODUCTION);
        break;
      case InstitutionalOperationalAction.LMS_CONFIRM_UPLOAD:
        await notify(UserRole.PLANEACION, `LMS completo carga del semestre ${semester.semesterNumber}.`, NotificationEventType.INSTITUTIONAL_LMS_UPLOAD_COMPLETED);
        break;
      case InstitutionalOperationalAction.PLANNING_VALIDATE_LMS:
        if (semester.project.productOwner?.id) {
          await this.notificationsService.notifyUser(semester.project.productOwner.id, {
            type: NotificationType.INFO,
            title,
            message: `Revision academica habilitada para el semestre ${semester.semesterNumber}.`,
            projectId: semester.project.id,
            eventType: NotificationEventType.INSTITUTIONAL_PLANNING_VALIDATED_LMS,
            actionUrl: url,
          }, manager);
        }
        break;
      case InstitutionalOperationalAction.PLANNING_RETURN_INITIAL:
      case InstitutionalOperationalAction.PLANNING_RETURN_PRODUCTION:
        await notify(UserRole.FABRICA, `Planeacion devolvio el semestre ${semester.semesterNumber}: ${dto.returnReason ?? dto.comment}`, NotificationEventType.INSTITUTIONAL_RETURNED_TO_FACTORY);
        break;
      case InstitutionalOperationalAction.PLANNING_RETURN_LMS:
        await notify(UserRole.LMS, `Planeacion devolvio LMS del semestre ${semester.semesterNumber}: ${dto.returnReason ?? dto.comment}`, NotificationEventType.INSTITUTIONAL_RETURNED_TO_LMS);
        break;
      case InstitutionalOperationalAction.PRODUCT_REQUEST_CHANGES:
        await notify(UserRole.FABRICA, `Product solicito cambios en el semestre ${semester.semesterNumber}.`, NotificationEventType.INSTITUTIONAL_PRODUCT_REQUESTED_CHANGES);
        break;
      default:
        break;
    }
  }

  private async ensureChecks(semesterId: string): Promise<void> {
    const existing = await this.checkRepo.count({ where: { semester: { id: semesterId } } });
    if (existing > 0) return;
    await this.checkRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(SemesterOperationalCheckEntity);
      for (const def of OPERATIONAL_CHECK_DEFINITIONS) {
        await repo.save(repo.create({ semester: { id: semesterId }, checkKey: def.key, label: def.label, status: OperationalCheckStatus.PENDING }));
      }
    });
  }

  private async loadSubjectSummaries(
    semesterId: string,
    user: UserEntity,
    operationalState: InstitutionalOperationalState,
  ): Promise<SemesterSubjectSummary[]> {
    const includeAcademicBlockers =
      isSemesterProductAcademicReviewPhase(operationalState) &&
      (user.role === UserRole.PRODUCT || user.role === UserRole.ADMIN);
    const subjects = await this.subjectRepo.find({ where: { semester: { id: semesterId }, deletedAt: IsNull() }, order: { name: 'ASC' } });
    return Promise.all(subjects.map(async (subject) => {
      const blockers: string[] = includeAcademicBlockers
        ? await this.subjectsService.getAcademicApprovalBlockers(subject.id, user).catch(() => [])
        : [];
      const openObservationsCount = await this.observationsService
        .countUnresolvedObservationsForSubject(subject.id, this.semesterRepo.manager)
        .catch(() => 0);
      if (openObservationsCount > 0) {
        blockers.push(
          openObservationsCount === 1
            ? '1 observación de Product sin resolver'
            : `${openObservationsCount} observaciones de Product sin resolver`,
        );
      }
      return {
        subjectId: subject.id,
        subjectName: subject.name,
        status: subject.status,
        operationalState: subject.operationalState,
        internalState: this.deriveInternalState(subject, openObservationsCount),
        progress: subject.progress,
        blockers,
        openObservationsCount,
      };
    }));
  }

  private deriveInternalState(subject: SubjectEntity, openObservationsCount: number): string {
    if (subject.operationalState === InstitutionalOperationalState.FINALIZED) return 'FINALIZED';
    if (subject.status === SubjectStatus.APPROVED) return 'ACADEMIC_APPROVED';
    if (openObservationsCount > 0 || subject.status === SubjectStatus.CHANGES_REQUESTED) {
      return 'HAS_OBSERVATIONS';
    }
    if (isSubjectFactoryProductionComplete(subject)) return 'FACTORY_PRODUCTION_COMPLETE';
    if (subject.progress > 0 || subject.status === SubjectStatus.IN_PRODUCTION) return 'IN_PROGRESS';
    return 'NOT_STARTED';
  }

  private async countOpenObservations(semesterId: string): Promise<number> {
    return this.subjectRepo.manager.query(
      `SELECT COUNT(o.id)::int AS count
       FROM observations o
       INNER JOIN subjects s ON s.id = o."subjectId"
       WHERE s."semesterId" = $1 AND o.status != 'RESUELTA'`,
      [semesterId],
    ).then((rows: { count: number }[]) => Number(rows[0]?.count ?? 0));
  }

  private async countFactoryProductionReadySubjects(semesterId: string): Promise<number> {
    const subjects = await this.subjectRepo.find({
      where: { semester: { id: semesterId }, deletedAt: IsNull() },
    });
    return subjects.filter((s) => isSubjectFactoryProductionComplete(s)).length;
  }

  private mapCheck(c: SemesterOperationalCheckEntity): OperationalCheckDto {
    return {
      key: c.checkKey,
      label: c.label,
      responsibleRole: OPERATIONAL_CHECK_DEFINITIONS.find((d) => d.key === c.checkKey)?.responsibleRole ?? UserRole.PLANEACION,
      status: c.status,
      checkedAt: c.checkedAt,
      checkedByName: c.checkedBy?.name ?? null,
      comment: c.comment,
      evidenceUrl: c.evidenceUrl,
    };
  }

  private mapTransition(t: SemesterOperationalTransitionEntity): OperationalTransitionRecordDto {
    return {
      id: t.id,
      fromState: t.fromState,
      toState: t.toState,
      action: t.action,
      actorName: t.actor.name,
      actorRole: t.actorRole,
      comment: t.comment,
      returnReason: t.returnReason,
      createdAt: t.createdAt,
    };
  }
}
