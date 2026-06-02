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
import { EntityManager, In, IsNull, Repository } from 'typeorm';
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

function resolveProductOwnerName(project: { productOwner?: { name?: string | null } | null }): string | null {
  const name = project.productOwner?.name?.trim();
  return name || null;
}
import { SemesterEntity } from '../semesters/semester.entity';
import { FactoryProductionStatus } from '../common/enums/factory-production-status.enum';
import { ChecklistStatus } from '../common/enums/checklist-status.enum';
import {
  SUBJECT_TOPICS_MAX,
  SUBJECT_TOPICS_MIN,
  SUBJECT_TOPICS_RANGE_MESSAGE,
} from '../common/constants/subject-topics.constants';
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
import { isReducedInstitutionalFlow } from './institutional-workflow.config';
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

/** Estados donde el cierre académico automático ya no aplica en lecturas del workspace. */
const SEMESTER_WORKSPACE_READ_ONLY_STATES: InstitutionalOperationalState[] = [
  InstitutionalOperationalState.FINALIZED,
  InstitutionalOperationalState.PENDING_PROJECT_RADICATION,
];

/** Estados que pueden disparar sync de cierre académico al abrir el workspace. */
const SEMESTER_CLOSURE_SYNC_STATES: InstitutionalOperationalState[] = [
  InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW,
  InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW,
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

interface SemesterWorkspaceLoadContext {
  subjects: SubjectEntity[];
  unresolvedBySubject: Map<string, number>;
  blockingBySubject: Map<string, number>;
}

export interface SemesterOperationalWorkspaceDto {
  semesterId: string;
  semesterNumber: number;
  projectId: string;
  program: string;
  school: string;
  productOwnerName: string | null;
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
  productOwnerName: string | null;
  operationalState: InstitutionalOperationalState;
  currentResponsibleRole: UserRole;
  stageDueAt: Date | null;
  slaStatus: string;
  availableActions: InstitutionalOperationalAction[];
  lastReturnReason: string | null;
  actionUrl: string;
  subjectsTotal: number;
  subjectsReady: number;
  subjectsApproved: number;
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
    const initial = isReducedInstitutionalFlow()
      ? InstitutionalOperationalState.PENDING_FACTORY
      : InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION;
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
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException('El rol ADMIN no puede ejecutar transiciones operacionales');
    }
    const allowed = allowedActionsForRole(user.role, semester.operationalState);
    if (!allowed.includes(dto.action)) throw new ForbiddenException('Accion no permitida para su rol en este estado');
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
    options?: { bypassReadinessCheck?: boolean },
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

    if (!options?.bypassReadinessCheck) {
      await this.assertReadyForAction(fresh, dto.action, user, manager);
    }

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

    if (
      dto.action === InstitutionalOperationalAction.PLANNING_VALIDATE_INITIAL ||
      (isReducedInstitutionalFlow() && fromState === InstitutionalOperationalState.PENDING_FACTORY)
    ) {
      await this.projectRadicationWorkflow.lockScopeIfNeeded(fresh.project.id, manager);
    }
    if (dto.action === InstitutionalOperationalAction.PRODUCT_APPROVE_ACADEMIC) {
      await this.projectRadicationWorkflow.onSubjectApprovedForRadication(fresh.project.id, manager, user);
    }
  }

  /**
   * Sincroniza transiciones de cierre académico del semestre cuando el trabajo ya está hecho
   * pero el estado persistido quedó desalineado (p. ej. materias aprobadas sin cierre formal).
   */
  async syncSemestersWhenAllSubjectsReadyForRadication(
    projectId: string,
    manager: EntityManager,
    user: UserEntity,
  ): Promise<void> {
    const semesterRepo = manager.getRepository(SemesterEntity);
    const subjectRepo = manager.getRepository(SubjectEntity);

    const semesters = await semesterRepo.find({
      where: {
        project: { id: projectId },
        deletedAt: IsNull(),
        createdFromChange: false,
        operationalState: In(SEMESTER_CLOSURE_SYNC_STATES),
      },
    });
    if (semesters.length === 0) return;

    for (let pass = 0; pass < 2; pass += 1) {
      for (const semester of semesters) {
        const current = await semesterRepo.findOne({ where: { id: semester.id } });
        if (!current) continue;

        const subjects = await subjectRepo.find({
          where: {
            semester: { id: semester.id },
            deletedAt: IsNull(),
            createdFromChange: false,
          },
        });
        if (subjects.length === 0) continue;

        if (current.operationalState === InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW) {
          const openObservations = await this.countOpenObservations(semester.id);
          const allFactoryComplete = subjects.every((subject) => isSubjectFactoryProductionComplete(subject));
          if (allFactoryComplete && openObservations === 0) {
            await this.applyTransitionInManager(
              manager,
              semester.id,
              { action: InstitutionalOperationalAction.PRODUCT_START_ACADEMIC_REVIEW },
              user,
              { bypassReadinessCheck: true },
            );
          }
          continue;
        }

        if (current.operationalState !== InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW) {
          continue;
        }

        const allSubjectsReady = subjects.every(
          (subject) =>
            subject.status === SubjectStatus.APPROVED &&
            subject.operationalState === InstitutionalOperationalState.PENDING_PROJECT_RADICATION,
        );
        if (!allSubjectsReady) continue;

        await this.applyTransitionInManager(
          manager,
          semester.id,
          { action: InstitutionalOperationalAction.PRODUCT_APPROVE_ACADEMIC },
          user,
          { bypassReadinessCheck: true },
        );
      }
    }
  }

  private shouldSkipSemesterClosureSync(state: InstitutionalOperationalState): boolean {
    return SEMESTER_WORKSPACE_READ_ONLY_STATES.includes(state);
  }

  private sumObservationCounts(counts: Map<string, number>): number {
    let total = 0;
    for (const count of counts.values()) total += count;
    return total;
  }

  private async syncProjectSemesterClosureIfNeeded(
    projectId: string,
    user: UserEntity,
    manager?: EntityManager,
  ): Promise<void> {
    const run = async (tx: EntityManager) => {
      try {
        await this.syncSemestersWhenAllSubjectsReadyForRadication(projectId, tx, user);
      } catch {
        // No bloquear lecturas del workspace por fallos de sincronización oportunista.
      }
    };
    if (manager) {
      await run(manager);
      return;
    }
    await this.semesterRepo.manager.transaction(run);
  }

  async getWorkspace(semesterId: string, user: UserEntity): Promise<SemesterOperationalWorkspaceDto> {
    let semester = await this.loadSemester(semesterId);
    this.assertAccess(semester, user);

    const skipClosureSync = this.shouldSkipSemesterClosureSync(semester.operationalState);
    if (!skipClosureSync) {
      await this.syncProjectSemesterClosureIfNeeded(semester.project.id, user);
      semester = await this.loadSemester(semesterId);
    }

    const needsAcademicDetail =
      isSemesterProductAcademicReviewPhase(semester.operationalState) &&
      (user.role === UserRole.PRODUCT || user.role === UserRole.ADMIN);

    const [loadContext, checks, timeline] = await Promise.all([
      this.loadSemesterWorkspaceContext(semesterId, { includeAcademicRelations: needsAcademicDetail }),
      this.checkRepo.find({
        where: { semester: { id: semesterId } },
        relations: { checkedBy: true },
        order: { checkKey: 'ASC' },
      }),
      this.transitionRepo.find({
        where: { semester: { id: semesterId } },
        relations: { actor: true },
        order: { createdAt: 'ASC' },
      }),
      skipClosureSync ? Promise.resolve() : this.ensureChecks(semesterId),
    ]);

    const openObservations = this.sumObservationCounts(loadContext.unresolvedBySubject);

    const subjects = this.buildSubjectSummaries(loadContext, user, semester.operationalState);
    const readiness = this.computeReadinessFromContext(semester, null, loadContext);
    const availableActions = user.role === UserRole.ADMIN
      ? []
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
    const subjectsReady = loadContext.subjects.filter((s) => isSubjectFactoryProductionComplete(s)).length;
    return {
      semesterId: semester.id,
      semesterNumber: semester.semesterNumber,
      projectId: semester.project.id,
      program: semester.project.program,
      school: semester.project.school,
      productOwnerName: resolveProductOwnerName(semester.project),
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
    if (isReducedInstitutionalFlow() && user.role === UserRole.PLANEACION) {
      return [];
    }
    const semesters = await this.semesterRepo
      .createQueryBuilder('sem')
      .innerJoinAndSelect('sem.project', 'p')
      .leftJoinAndSelect('p.productOwner', 'productOwner')
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
      semesters.map((s) => this.buildSemesterWorkItem(s, user, { availableActions: [] })),
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
    if (states.length === 0) {
      return [];
    }
    const qb = this.semesterRepo.createQueryBuilder('sem')
      .innerJoinAndSelect('sem.project', 'p')
      .leftJoinAndSelect('p.productOwner', 'productOwner')
      .leftJoinAndSelect('sem.subjects', 'subjects', 'subjects.deletedAt IS NULL')
      .where('sem.deletedAt IS NULL')
      .andWhere('p.deletedAt IS NULL')
      .andWhere('p.legacyWorkflow = false')
      .andWhere('sem.operational_state IN (:...states)', { states });
    if (user.role === UserRole.PRODUCT) qb.andWhere('p.productOwnerId = :userId', { userId: user.id });
    if (user.role === UserRole.FABRICA) qb.andWhere('(p.factoryOwnerId = :userId OR p.factoryOwnerId IS NULL)', { userId: user.id });
    const semesters = await qb.orderBy('sem.operational_stage_due_at', 'ASC', 'NULLS LAST').addOrderBy('sem.updatedAt', 'DESC').getMany();
    return Promise.all(semesters.map((s) => this.buildSemesterWorkItem(s, user)));
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

    await this.syncProjectSemesterClosureIfNeeded(projectId, user);

    const refreshedSemesters = await this.semesterRepo
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

    const items = await Promise.all(
      refreshedSemesters.map(async (s) => this.buildSemesterWorkItem(s, user)),
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
    options?: { availableActions?: InstitutionalOperationalAction[] },
  ): Promise<SemesterOperationalWorkItemDto> {
    const openObservations = await this.countOpenObservations(s.id);
    const ready = await this.countFactoryProductionReadySubjects(s.id);
    const subjectsApproved = (s.subjects ?? []).filter(
      (subject) =>
        subject.status === SubjectStatus.APPROVED ||
        subject.operationalState === InstitutionalOperationalState.PENDING_PROJECT_RADICATION ||
        subject.operationalState === InstitutionalOperationalState.FINALIZED,
    ).length;
    const firstSubject = s.subjects?.[0];
    const actions =
      options?.availableActions ??
      (user.role === UserRole.ADMIN
        ? allowedActionsForRole(responsibleRoleForState(s.operationalState), s.operationalState)
        : allowedActionsForRole(user.role, s.operationalState));
    return {
      kind: 'semester',
      semesterId: s.id,
      semesterNumber: s.semesterNumber,
      subjectId: firstSubject?.id ?? s.id,
      subjectName: `Semestre ${s.semesterNumber}`,
      projectId: s.project.id,
      program: s.project.program,
      school: s.project.school,
      productOwnerName: resolveProductOwnerName(s.project),
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
      subjectsApproved,
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
      .leftJoinAndSelect('p.productOwner', 'productOwner')
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
      semesters.map((s) => this.buildSemesterWorkItem(s, user, { availableActions: [] })),
    );
  }

  async listProgramsTrackingForProduct(user: UserEntity): Promise<ProgramOperationalWorkItemDto[]> {
    const semesters = await this.listTrackingForProduct(user);
    return aggregateSemestersToPrograms(semesters);
  }

  private async loadSemester(semesterId: string): Promise<SemesterEntity> {
    const semester = await this.semesterRepo.findOne({
      where: { id: semesterId, deletedAt: IsNull() },
      relations: { project: { productOwner: true, factoryOwner: true } },
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

  private async loadSemesterWorkspaceContext(
    semesterId: string,
    options?: { includeAcademicRelations?: boolean },
  ): Promise<SemesterWorkspaceLoadContext> {
    const includeAcademicRelations = options?.includeAcademicRelations ?? false;
    const [subjects, observationStats] = await Promise.all([
      this.subjectRepo.find({
        where: { semester: { id: semesterId }, deletedAt: IsNull() },
        ...(includeAcademicRelations
          ? { relations: { checklist: true, topics: true } }
          : {}),
        order: { name: 'ASC' },
      }),
      this.observationsService.countObservationStatsForSemester(semesterId),
    ]);

    return {
      subjects,
      unresolvedBySubject: observationStats.unresolvedBySubject,
      blockingBySubject: observationStats.blockingBySubject,
    };
  }

  private buildAcademicBlockersInMemory(
    subject: SubjectEntity,
    unresolvedCount: number,
    blockingCount: number,
  ): string[] {
    const blockers: string[] = [];
    const items = subject.checklist ?? [];
    const topicsCount = (subject.topics ?? []).filter((topic) => !topic.deletedAt).length;

    if (topicsCount < SUBJECT_TOPICS_MIN || topicsCount > SUBJECT_TOPICS_MAX) {
      blockers.push(SUBJECT_TOPICS_RANGE_MESSAGE);
    }

    const productItems = items.filter((item) => item.ownerRole === UserRole.PRODUCT);
    const factoryItems = items.filter((item) => item.ownerRole === UserRole.FABRICA);

    if (productItems.length === 0 && factoryItems.length === 0) {
      blockers.push('La asignatura no tiene entregables configurados en el checklist');
    }

    if (items.some((item) => item.status === ChecklistStatus.RECHAZADO)) {
      blockers.push('No puede aprobar académicamente mientras existan entregables rechazados');
    }

    const pendingProduct = productItems.filter((item) => item.status !== ChecklistStatus.APROBADO);
    if (pendingProduct.length > 0) {
      blockers.push(
        `Debe aprobar todos los entregables de Product (${pendingProduct.length} pendiente(s)) antes de la aprobación académica`,
      );
    }

    const pendingFactory = factoryItems.filter((item) => item.status !== ChecklistStatus.APROBADO);
    if (pendingFactory.length > 0) {
      blockers.push(
        `Debe aprobar todos los ítems de temas/gránulos (${pendingFactory.length} pendiente(s)) antes de la aprobación académica`,
      );
    }

    if (blockingCount > 0) {
      blockers.push('Aún existen correcciones pendientes por aplicar.');
    }

    if (unresolvedCount > 0) {
      blockers.push('Aún existen observaciones pendientes de validación.');
    }

    return blockers;
  }

  private buildSubjectSummaries(
    context: SemesterWorkspaceLoadContext,
    user: UserEntity,
    operationalState: InstitutionalOperationalState,
  ): SemesterSubjectSummary[] {
    const includeAcademicBlockers =
      isSemesterProductAcademicReviewPhase(operationalState) &&
      (user.role === UserRole.PRODUCT || user.role === UserRole.ADMIN);

    return context.subjects.map((subject) => {
      const openObservationsCount = context.unresolvedBySubject.get(subject.id) ?? 0;
      const blockers: string[] = includeAcademicBlockers
        ? this.buildAcademicBlockersInMemory(
            subject,
            openObservationsCount,
            context.blockingBySubject.get(subject.id) ?? 0,
          )
        : [];

      if (openObservationsCount > 0 && !includeAcademicBlockers) {
        blockers.push(
          openObservationsCount === 1
            ? '1 observación de Product sin resolver'
            : `${openObservationsCount} observaciones de Product sin resolver`,
        );
      } else if (openObservationsCount > 0 && includeAcademicBlockers) {
        const hasObsBlocker = blockers.some((b) => b.includes('observaciones'));
        if (!hasObsBlocker) {
          blockers.push(
            openObservationsCount === 1
              ? '1 observación de Product sin resolver'
              : `${openObservationsCount} observaciones de Product sin resolver`,
          );
        }
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
    });
  }

  private computeReadinessFromContext(
    semester: SemesterEntity,
    action: InstitutionalOperationalAction | null,
    context: SemesterWorkspaceLoadContext,
  ): { ready: boolean; blockers: string[] } {
    const blockers: string[] = [];
    const subjects = context.subjects;

    if (subjects.length === 0) blockers.push('El semestre no tiene asignaturas');

    const checkAction = action ?? this.primaryReadinessActionForState(semester.operationalState);

    for (const subject of subjects) {
      if (!subject.name?.trim()) {
        blockers.push(`Asignatura sin nombre en semestre ${semester.semesterNumber}`);
      }

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
        const unresolvedCount = context.unresolvedBySubject.get(subject.id) ?? 0;
        const blockingCount = context.blockingBySubject.get(subject.id) ?? 0;
        const subjectBlockers = this.buildAcademicBlockersInMemory(
          subject,
          unresolvedCount,
          blockingCount,
        );
        subjectBlockers.forEach((b) => blockers.push(`"${subject.name}": ${b}`));
      }
    }

    return { ready: blockers.length === 0, blockers: [...new Set(blockers)] };
  }

  private async computeReadiness(
    semester: SemesterEntity,
    action: InstitutionalOperationalAction | null,
    user: UserEntity,
    manager?: EntityManager,
  ): Promise<{ ready: boolean; blockers: string[] }> {
    const subjectRepo = manager?.getRepository(SubjectEntity) ?? this.subjectRepo;
    const subjects = await subjectRepo.find({
      where: { semester: { id: semester.id }, deletedAt: IsNull() },
      relations: { checklist: true, topics: true },
    });
    const observationStats = await this.observationsService.countObservationStatsForSemester(
      semester.id,
      manager ?? this.semesterRepo.manager,
    );

    return this.computeReadinessFromContext(semester, action, {
      subjects,
      unresolvedBySubject: observationStats.unresolvedBySubject,
      blockingBySubject: observationStats.blockingBySubject,
    });
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
    const reduced = isReducedInstitutionalFlow();
    switch (next) {
      case InstitutionalOperationalState.PENDING_FACTORY: return OperationalCheckKey.PLANNING_INITIAL_VALIDATED;
      case InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION: return OperationalCheckKey.FACTORY_CONTENT_DELIVERED;
      case InstitutionalOperationalState.PENDING_LMS_UPLOAD: return OperationalCheckKey.PLANNING_PRODUCTION_VALIDATED;
      case InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION: return OperationalCheckKey.LMS_UPLOAD_COMPLETED;
      case InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW:
        return reduced
          ? OperationalCheckKey.FACTORY_CONTENT_DELIVERED
          : OperationalCheckKey.PLANNING_LMS_VALIDATED;
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
    const reduced = isReducedInstitutionalFlow();
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
        if (reduced) {
          if (semester.project.productOwner?.id) {
            await this.notificationsService.notifyUser(semester.project.productOwner.id, {
              type: NotificationType.INFO,
              title,
              message: `Fabrica finalizo produccion del semestre ${semester.semesterNumber}.`,
              projectId: semester.project.id,
              eventType: NotificationEventType.INSTITUTIONAL_FACTORY_DELIVERED,
              actionUrl: url,
            }, manager);
          }
          break;
        }
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
    return this.subjectRepo.manager
      .query(
        `SELECT COUNT(o.id)::int AS count
       FROM observations o
       INNER JOIN subjects s ON s.id = o."subjectId"
       WHERE s."semesterId" = $1
         AND o.status != 'RESUELTA'
         AND (o.status != 'ABIERTA' OR o."notificationStatus" = 'SENT')`,
        [semesterId],
      )
      .then((rows: { count: number }[]) => Number(rows[0]?.count ?? 0));
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
