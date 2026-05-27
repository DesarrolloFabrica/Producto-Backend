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
import { EntityManager, In, IsNull, QueryDeepPartialEntity, Repository } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { InstitutionalOperationalAction } from '../common/enums/institutional-operational-action.enum';
import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import {
  OperationalCheckKey,
  OperationalCheckStatus,
} from '../common/enums/operational-check-key.enum';
import { NotificationEventType } from '../common/enums/notification-event-type.enum';
import { NotificationType } from '../common/enums/notification-type.enum';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { SubjectStatus } from '../common/enums/subject-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectEntity } from '../projects/project.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { SubjectsService } from '../subjects/subjects.service';
import { UserEntity } from '../users/user.entity';
import { OperationalTransitionDto } from './dto/operational-transition.dto';
import {
  OperationalCheckDto,
  OperationalTransitionRecordDto,
  OperationalWorkItemDto,
  OperationalWorkspaceDto,
} from './dto/operational-workspace.dto';
import { OperationalTransitionEntity } from './operational-transition.entity';
import { SubjectOperationalCheckEntity } from './subject-operational-check.entity';
import { ACADEMIC_REVIEW_BLOCKED_MESSAGE, OPERATIONAL_CHECK_DEFINITIONS } from './institutional-workflow.constants';
import { isInstitutionalWorkflowEnabled } from './institutional-workflow.config';
import { ProjectInstitutionalWorkflowService } from '../project-radication/project-institutional-workflow.service';
import { InstitutionalWorkflowSlaService } from './institutional-workflow-sla.service';
import {
  allowedActionsForRole,
  filterSubjectAvailableActions,
  isAcademicChecklistEditable,
  isAcademicReviewReady,
  isCorrectionInFactory,
  isReturnAction,
  isSemesterScopedOperationalAction,
  resolveNextInstitutionalState,
  responsibleRoleForState,
  statesPendingForRole,
} from './institutional-workflow.transitions';

@Injectable()
export class InstitutionalWorkflowService {
  constructor(
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(SubjectOperationalCheckEntity)
    private readonly checkRepo: Repository<SubjectOperationalCheckEntity>,
    @InjectRepository(OperationalTransitionEntity)
    private readonly transitionRepo: Repository<OperationalTransitionEntity>,
    private readonly slaService: InstitutionalWorkflowSlaService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => ProjectInstitutionalWorkflowService))
    private readonly projectRadicationWorkflow: ProjectInstitutionalWorkflowService,
    @Inject(forwardRef(() => SubjectsService))
    private readonly subjectsService: SubjectsService,
  ) {}

  usesInstitutionalWorkflow(project: Pick<ProjectEntity, 'legacyWorkflow'>): boolean {
    return isInstitutionalWorkflowEnabled() && !project.legacyWorkflow;
  }

  assertAcademicPhaseAllowed(subject: SubjectEntity, project: ProjectEntity): void {
    if (!this.usesInstitutionalWorkflow(project)) return;
    if (!isAcademicChecklistEditable(subject.operationalState)) {
      throw new ForbiddenException(ACADEMIC_REVIEW_BLOCKED_MESSAGE);
    }
  }

  private assertTransitionOwnership(subject: SubjectEntity, user: UserEntity): void {
    if (user.role === UserRole.ADMIN || user.role === UserRole.PLANEACION || user.role === UserRole.LMS) {
      return;
    }
    if (user.role === UserRole.PRODUCT) {
      if (subject.project.productOwner?.id !== user.id) {
        throw new ForbiddenException('No tiene permisos sobre esta asignatura');
      }
      return;
    }
    if (user.role === UserRole.FABRICA) {
      const factoryOwnerId = subject.project.factoryOwner?.id ?? null;
      if (factoryOwnerId && factoryOwnerId !== user.id) {
        throw new ForbiddenException('No tiene permisos sobre esta asignatura');
      }
    }
  }

  private isSemesterScopedSubjectAction(action: InstitutionalOperationalAction): boolean {
    return isSemesterScopedOperationalAction(action);
  }

  private assertNoSubjectSemesterScopedTransition(subject: SubjectEntity, action: InstitutionalOperationalAction): void {
    if (this.usesInstitutionalWorkflow(subject.project) && this.isSemesterScopedSubjectAction(action)) {
      throw new BadRequestException(
        `Esta accion se gestiona por semestre. Use /projects/${subject.project.id}/semesters/${subject.semester.id}/operations`,
      );
    }
  }

  async initializeSubjectOperational(
    subjectId: string,
    manager: EntityManager,
    actor: UserEntity,
  ): Promise<void> {
    if (!isInstitutionalWorkflowEnabled()) return;
    const subjectRepo = manager.getRepository(SubjectEntity);
    const checkRepository = manager.getRepository(SubjectOperationalCheckEntity);
    const transitionRepository = manager.getRepository(OperationalTransitionEntity);

    const now = new Date();
    const initial = InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION;
    await subjectRepo.update(subjectId, {
      operationalState: initial,
      operationalStageEnteredAt: now,
      operationalStageDueAt: this.slaService.computeStageDueAt(now, initial),
    });

    for (const def of OPERATIONAL_CHECK_DEFINITIONS) {
      await checkRepository.save(
        checkRepository.create({
          subject: { id: subjectId },
          checkKey: def.key,
          label: def.label,
          status: OperationalCheckStatus.PENDING,
        }),
      );
    }

    await transitionRepository.save(
      transitionRepository.create({
        subject: { id: subjectId },
        fromState: null,
        toState: initial,
        action: InstitutionalOperationalAction.INSTITUTIONAL_SUBJECT_CREATED,
        actor: { id: actor.id },
        actorRole: actor.role,
        comment: 'Solicitud creada',
        returnReason: null,
        evidenceUrl: null,
      }),
    );
  }

  async transition(
    subjectId: string,
    dto: OperationalTransitionDto,
    user: UserEntity,
  ): Promise<OperationalWorkspaceDto> {
    if (!isInstitutionalWorkflowEnabled()) {
      throw new BadRequestException('Workflow institucional deshabilitado');
    }

    const subject = await this.subjectRepo.findOne({
      where: { id: subjectId, deletedAt: IsNull() },
      relations: { project: { productOwner: true, factoryOwner: true }, semester: true },
    });
    if (!subject) throw new NotFoundException('Asignatura no encontrada');
    if (!this.usesInstitutionalWorkflow(subject.project)) {
      throw new BadRequestException('Proyecto en flujo legacy');
    }

    this.assertTransitionOwnership(subject, user);
    this.assertNoSubjectSemesterScopedTransition(subject, dto.action);

    if (user.role !== UserRole.ADMIN) {
      const allowed = allowedActionsForRole(user.role, subject.operationalState);
      if (!allowed.includes(dto.action)) {
        throw new ForbiddenException('Acción no permitida para su rol en este estado');
      }
    }

    if (isReturnAction(dto.action)) {
      const reason = (dto.returnReason ?? dto.comment ?? '').trim();
      if (reason.length < 10) {
        throw new BadRequestException('Debe indicar un motivo de devolución (mínimo 10 caracteres)');
      }
    }

    await this.subjectRepo.manager.transaction(async (manager) => {
      await this.applyTransitionInManager(manager, subjectId, dto, user);
    });

    return this.getWorkspace(subjectId, user);
  }

  async applyTransitionInManager(
    manager: EntityManager,
    subjectId: string,
    dto: OperationalTransitionDto,
    user: UserEntity,
  ): Promise<void> {
    const subjectRepository = manager.getRepository(SubjectEntity);
    const fresh = await subjectRepository.findOne({
      where: { id: subjectId },
      relations: { project: { productOwner: true, factoryOwner: true }, semester: true },
    });
    if (!fresh) throw new NotFoundException('Asignatura no encontrada');
    this.assertNoSubjectSemesterScopedTransition(fresh, dto.action);

    if (dto.action === InstitutionalOperationalAction.PRODUCT_APPROVE_ACADEMIC) {
      await this.subjectsService.assertReadyForAcademicApproval(subjectId, user, manager);
    }

    const fromState = fresh.operationalState;
    const next = resolveNextInstitutionalState({
      current: fromState,
      action: dto.action,
    });
    if (!next) {
      throw new BadRequestException('Transición no válida para el estado actual');
    }

    if (next === fromState) {
      return;
    }

    const now = new Date();
    const updatePayload: QueryDeepPartialEntity<SubjectEntity> = {
      operationalState: next,
      operationalStageEnteredAt: now,
      operationalStageDueAt: this.slaService.computeStageDueAt(now, next),
    };

    if (isReturnAction(dto.action)) {
      const reason = (dto.returnReason ?? dto.comment ?? '').trim();
      updatePayload.lastReturnReason = reason;
      updatePayload.lastReturnAt = now;
      updatePayload.lastReturnBy = { id: user.id };
    } else if (
      next !== InstitutionalOperationalState.RETURNED_TO_PRODUCT_FROM_PLANNING &&
      next !== InstitutionalOperationalState.RETURNED_TO_FACTORY_FROM_PLANNING &&
      next !== InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING
    ) {
      updatePayload.lastReturnReason = null;
      updatePayload.lastReturnAt = null;
      updatePayload.lastReturnBy = null;
    }

    if (next === InstitutionalOperationalState.FINALIZED) {
      updatePayload.operationalFinalizedAt = now;
    }

    const updateResult = await subjectRepository.update(
      { id: subjectId, operationalState: fromState },
      updatePayload,
    );
    if (!updateResult.affected) {
      throw new ConflictException('El estado operacional cambió. Recargue la página e intente de nuevo.');
    }

    const updated = await subjectRepository.findOne({
      where: { id: subjectId },
      relations: { project: { productOwner: true, factoryOwner: true }, semester: true },
    });
    if (!updated) throw new NotFoundException('Asignatura no encontrada');

    await this.syncAcademicStatus(updated, dto.action, user, manager);
    await subjectRepository.save(updated);
    await this.markOperationalCheck(updated.id, next, user, dto, manager);
    await this.recordTransition(updated.id, fromState, next, dto, user, manager);
    await this.dispatchTransitionSideEffects(updated, fromState, next, dto, user, manager);
    await this.auditService.createLog(
      {
        entityType: 'SUBJECT',
        entityId: updated.id,
        action: AuditAction.STATUS_CHANGE,
        userId: user.id,
        beforeJson: { operationalState: fromState },
        afterJson: { operationalState: next, action: dto.action },
      },
      manager,
    );

    if (
      dto.action === InstitutionalOperationalAction.PLANNING_VALIDATE_INITIAL &&
      this.usesInstitutionalWorkflow(updated.project)
    ) {
      await this.projectRadicationWorkflow.lockScopeIfNeeded(updated.project.id, manager);
    }

    if (
      dto.action === InstitutionalOperationalAction.PRODUCT_APPROVE_ACADEMIC &&
      this.usesInstitutionalWorkflow(updated.project)
    ) {
      await this.projectRadicationWorkflow.onSubjectApprovedForRadication(
        updated.project.id,
        manager,
        user,
      );
    }
  }

  async getWorkspace(subjectId: string, user: UserEntity): Promise<OperationalWorkspaceDto> {
    const subject = await this.subjectRepo.findOne({
      where: { id: subjectId, deletedAt: IsNull() },
      relations: { project: true, semester: true },
    });
    if (!subject) throw new NotFoundException('Asignatura no encontrada');

    const checks = await this.checkRepo.find({
      where: { subject: { id: subjectId } },
      relations: { checkedBy: true },
      order: { checkKey: 'ASC' },
    });
    const timeline = await this.transitionRepo.find({
      where: { subject: { id: subjectId } },
      relations: { actor: true },
      order: { createdAt: 'ASC' },
    });

    const role = user.role === UserRole.ADMIN ? UserRole.PLANEACION : user.role;
    const availableActions =
      user.role === UserRole.ADMIN
        ? allowedActionsForRole(UserRole.PLANEACION, subject.operationalState).concat(
            allowedActionsForRole(UserRole.FABRICA, subject.operationalState),
            allowedActionsForRole(UserRole.LMS, subject.operationalState),
            allowedActionsForRole(UserRole.PRODUCT, subject.operationalState),
          )
        : allowedActionsForRole(role, subject.operationalState);

    const uniqueActions = [...new Set(availableActions)];

    const academicChecklistEnabled = isAcademicChecklistEditable(subject.operationalState);
    const academicReviewReady = isAcademicReviewReady(subject.operationalState);
    const correctionInFactory = isCorrectionInFactory(subject.operationalState);

    let academicApprovalBlockers: string[] = [];
    let filteredActions = filterSubjectAvailableActions(
      uniqueActions,
      this.usesInstitutionalWorkflow(subject.project),
    );
    if (
      uniqueActions.includes(InstitutionalOperationalAction.PRODUCT_APPROVE_ACADEMIC) ||
      subject.operationalState === InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW
    ) {
      academicApprovalBlockers = await this.subjectsService.getAcademicApprovalBlockers(
        subjectId,
        user,
      );
      if (academicApprovalBlockers.length > 0) {
        filteredActions = filteredActions.filter(
          (action) => action !== InstitutionalOperationalAction.PRODUCT_APPROVE_ACADEMIC,
        );
      }
    }

    return {
      subjectId: subject.id,
      subjectName: subject.name,
      projectId: subject.project.id,
      semesterId: subject.semester.id,
      semesterNumber: subject.semester.semesterNumber,
      program: subject.project.program,
      school: subject.project.school,
      operationalState: subject.operationalState,
      academicReviewEnabled: academicChecklistEnabled || academicReviewReady,
      academicChecklistEnabled,
      academicReviewReady,
      correctionInFactory,
      institutionalFlowActive: this.usesInstitutionalWorkflow(subject.project),
      slaStatus: this.slaService.computeSlaStatus({
        state: subject.operationalState,
        stageEnteredAt: subject.operationalStageEnteredAt,
        stageDueAt: subject.operationalStageDueAt,
        finalizedAt: subject.operationalFinalizedAt,
      }),
      stageDueAt: subject.operationalStageDueAt,
      lastReturnReason: subject.lastReturnReason,
      lastReturnAt: subject.lastReturnAt,
      checks: checks.map((c) => this.mapCheck(c)),
      timeline: timeline.map((t) => this.mapTransition(t)),
      availableActions: filteredActions,
      academicApprovalReady: academicApprovalBlockers.length === 0,
      academicApprovalBlockers,
    };
  }

  async listWorkForRole(user: UserEntity): Promise<OperationalWorkItemDto[]> {
    const pendingStates =
      user.role === UserRole.ADMIN
        ? statesPendingForRole(UserRole.PLANEACION).concat(
            statesPendingForRole(UserRole.FABRICA),
            statesPendingForRole(UserRole.LMS),
            statesPendingForRole(UserRole.PRODUCT),
          )
        : statesPendingForRole(user.role);

    const uniqueStates = [...new Set(pendingStates)];

    const qb = this.subjectRepo
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.project', 'p')
      .innerJoinAndSelect('s.semester', 'sem')
      .where('s.deletedAt IS NULL')
      .andWhere('p.legacyWorkflow = false')
      .andWhere('s.operationalState IN (:...states)', { states: uniqueStates });

    if (user.role === UserRole.PRODUCT) {
      qb.andWhere('p.productOwnerId = :ownerId', { ownerId: user.id });
    }
    if (user.role === UserRole.FABRICA) {
      qb.andWhere('(p.factoryOwnerId = :ownerId OR p.factoryOwnerId IS NULL)', { ownerId: user.id });
    }

    const subjects = await qb
      .orderBy('s.operationalStageDueAt', 'ASC', 'NULLS LAST')
      .addOrderBy('s.updatedAt', 'DESC')
      .getMany();

    return subjects.map((s) => {
      const role = user.role === UserRole.ADMIN ? responsibleRoleForState(s.operationalState) : user.role;
      const actions = filterSubjectAvailableActions(
        user.role === UserRole.ADMIN
          ? allowedActionsForRole(responsibleRoleForState(s.operationalState), s.operationalState)
          : allowedActionsForRole(user.role, s.operationalState),
        true,
      );
      return {
        subjectId: s.id,
        subjectName: s.name,
        projectId: s.project.id,
        program: s.project.program,
        school: s.project.school,
        semesterNumber: s.semester.semesterNumber,
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
        actionUrl: `/subjects/${s.id}/operations`,
      };
    });
  }

  private mapCheck(c: SubjectOperationalCheckEntity): OperationalCheckDto {
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

  private mapTransition(t: OperationalTransitionEntity): OperationalTransitionRecordDto {
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

  private async syncAcademicStatus(
    subject: SubjectEntity,
    action: InstitutionalOperationalAction,
    user: UserEntity,
    manager: EntityManager,
  ): Promise<void> {
    const projectRepo = manager.getRepository(ProjectEntity);
    if (action === InstitutionalOperationalAction.FACTORY_START_PRODUCTION) {
      subject.status = SubjectStatus.IN_PRODUCTION;
      if (subject.project.status === ProjectStatus.READY_FOR_PRODUCTION) {
        subject.project.status = ProjectStatus.IN_PRODUCTION;
        await projectRepo.save(subject.project);
      }
    }
    if (action === InstitutionalOperationalAction.PRODUCT_START_ACADEMIC_REVIEW) {
      subject.status = SubjectStatus.IN_REVIEW;
      subject.project.status = ProjectStatus.IN_REVIEW;
      await projectRepo.save(subject.project);
    }
    if (action === InstitutionalOperationalAction.PRODUCT_REQUEST_CHANGES) {
      subject.status = SubjectStatus.CHANGES_REQUESTED;
      subject.project.status = ProjectStatus.FEEDBACK_PENDING;
      await projectRepo.save(subject.project);
    }
    if (action === InstitutionalOperationalAction.PRODUCT_APPROVE_ACADEMIC) {
      subject.status = SubjectStatus.APPROVED;
    }
    if (action === InstitutionalOperationalAction.FACTORY_START_PRODUCTION && subject.status === SubjectStatus.CHANGES_REQUESTED) {
      subject.status = SubjectStatus.IN_PRODUCTION;
    }
  }

  private checkKeyForState(next: InstitutionalOperationalState): OperationalCheckKey | null {
    switch (next) {
      case InstitutionalOperationalState.PENDING_FACTORY:
        return OperationalCheckKey.PLANNING_INITIAL_VALIDATED;
      case InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION:
        return OperationalCheckKey.FACTORY_CONTENT_DELIVERED;
      case InstitutionalOperationalState.PENDING_LMS_UPLOAD:
        return OperationalCheckKey.PLANNING_PRODUCTION_VALIDATED;
      case InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION:
        return OperationalCheckKey.LMS_UPLOAD_COMPLETED;
      case InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW:
        return OperationalCheckKey.PLANNING_LMS_VALIDATED;
      case InstitutionalOperationalState.PENDING_PROJECT_RADICATION:
        return OperationalCheckKey.PRODUCT_ACADEMIC_APPROVED;
      case InstitutionalOperationalState.FINALIZED:
        return OperationalCheckKey.PLANNING_FINAL_RADICATED;
      default:
        return null;
    }
  }

  private async markOperationalCheck(
    subjectId: string,
    next: InstitutionalOperationalState,
    user: UserEntity,
    dto: OperationalTransitionDto,
    manager: EntityManager,
  ): Promise<void> {
    const key = this.checkKeyForState(next);
    if (!key) return;
    const checkRepository = manager.getRepository(SubjectOperationalCheckEntity);
    const row = await checkRepository.findOne({
      where: { subject: { id: subjectId }, checkKey: key },
    });
    if (!row) return;
    row.status = OperationalCheckStatus.CHECKED;
    row.checkedAt = new Date();
    row.checkedBy = { id: user.id } as UserEntity;
    row.comment = dto.comment ?? row.comment;
    row.evidenceUrl = dto.evidenceUrl ?? row.evidenceUrl;
    await checkRepository.save(row);
  }

  private async recordTransition(
    subjectId: string,
    fromState: InstitutionalOperationalState,
    toState: InstitutionalOperationalState,
    dto: OperationalTransitionDto,
    user: UserEntity,
    manager: EntityManager,
  ): Promise<void> {
    const transitionRepository = manager.getRepository(OperationalTransitionEntity);
    await transitionRepository.save(
      transitionRepository.create({
        subject: { id: subjectId },
        fromState,
        toState,
        action: dto.action,
        actor: { id: user.id },
        actorRole: user.role,
        comment: dto.comment ?? null,
        returnReason: isReturnAction(dto.action) ? (dto.returnReason ?? dto.comment ?? null) : null,
        evidenceUrl: dto.evidenceUrl ?? null,
      }),
    );
  }

  private async dispatchTransitionSideEffects(
    subject: SubjectEntity,
    from: InstitutionalOperationalState,
    to: InstitutionalOperationalState,
    dto: OperationalTransitionDto,
    user: UserEntity,
    manager: EntityManager,
  ): Promise<void> {
    const name = subject.name;
    const projectId = subject.project.id;
    const subjectId = subject.id;
    const url = `/subjects/${subjectId}/operations`;

    const notify = (role: UserRole, title: string, message: string, eventType: NotificationEventType) =>
      this.notificationsService.notifyRole(
        role,
        {
          type: NotificationType.INFO,
          title,
          message,
          projectId,
          subjectId,
          eventType,
          actionUrl: url,
        },
        manager,
      );

    switch (dto.action) {
      case InstitutionalOperationalAction.PLANNING_VALIDATE_INITIAL:
        await notify(UserRole.FABRICA, 'Solicitud validada', `Planeación validó la solicitud de "${name}".`, NotificationEventType.INSTITUTIONAL_PLANNING_VALIDATED_INITIAL);
        void this.mailService.sendInstitutionalTransitionEmail({ subject, action: dto.action });
        break;
      case InstitutionalOperationalAction.PLANNING_RETURN_INITIAL:
        if (subject.project.productOwner?.id) {
          await this.notificationsService.notifyUser(
            subject.project.productOwner.id,
            {
              type: NotificationType.CRITICAL,
              title: 'Solicitud devuelta',
              message: `Planeación devolvió la solicitud de "${name}": ${dto.returnReason ?? dto.comment}`,
              projectId,
              subjectId,
              eventType: NotificationEventType.INSTITUTIONAL_RETURNED_TO_PRODUCT,
              actionUrl: url,
            },
            manager,
          );
        }
        void this.mailService.sendInstitutionalTransitionEmail({ subject, action: dto.action, reason: dto.returnReason ?? dto.comment });
        break;
      case InstitutionalOperationalAction.FACTORY_DELIVER_CONTENT:
        await notify(UserRole.PLANEACION, 'Contenido entregado', `Fábrica terminó producción de "${name}".`, NotificationEventType.INSTITUTIONAL_FACTORY_DELIVERED);
        await notify(UserRole.LMS, 'Pendiente carga LMS', `La asignatura "${name}" estará lista tras validación de Planeación.`, NotificationEventType.INSTITUTIONAL_FACTORY_DELIVERED);
        if (subject.project.productOwner?.id) {
          await this.notificationsService.notifyUser(
            subject.project.productOwner.id,
            {
              type: NotificationType.INFO,
              title: 'Producción terminada',
              message: `Fábrica terminó contenido de "${name}" (pendiente validación Planeación).`,
              projectId,
              subjectId,
              eventType: NotificationEventType.INSTITUTIONAL_FACTORY_DELIVERED,
              actionUrl: url,
            },
            manager,
          );
        }
        void this.mailService.sendInstitutionalTransitionEmail({ subject, action: dto.action });
        break;
      case InstitutionalOperationalAction.PLANNING_VALIDATE_PRODUCTION:
        await notify(UserRole.LMS, 'Listo para carga LMS', `Planeación validó producción de "${name}".`, NotificationEventType.INSTITUTIONAL_PLANNING_VALIDATED_PRODUCTION);
        void this.mailService.sendInstitutionalTransitionEmail({ subject, action: dto.action });
        break;
      case InstitutionalOperationalAction.PLANNING_RETURN_PRODUCTION:
        await notify(UserRole.FABRICA, 'Producción devuelta', `Planeación devolvió "${name}": ${dto.returnReason ?? dto.comment}`, NotificationEventType.INSTITUTIONAL_RETURNED_TO_FACTORY);
        void this.mailService.sendInstitutionalTransitionEmail({ subject, action: dto.action, reason: dto.returnReason ?? dto.comment });
        break;
      case InstitutionalOperationalAction.LMS_CONFIRM_UPLOAD:
        await notify(UserRole.PLANEACION, 'Carga LMS completada', `LMS completó carga de "${name}".`, NotificationEventType.INSTITUTIONAL_LMS_UPLOAD_COMPLETED);
        if (subject.project.productOwner?.id) {
          await this.notificationsService.notifyUser(
            subject.project.productOwner.id,
            {
              type: NotificationType.INFO,
              title: 'Carga LMS completada',
              message: `LMS completó carga de "${name}" (pendiente validación Planeación).`,
              projectId,
              subjectId,
              eventType: NotificationEventType.INSTITUTIONAL_LMS_UPLOAD_COMPLETED,
              actionUrl: url,
            },
            manager,
          );
        }
        void this.mailService.sendInstitutionalTransitionEmail({ subject, action: dto.action });
        break;
      case InstitutionalOperationalAction.PLANNING_VALIDATE_LMS:
        if (subject.project.productOwner?.id) {
          await this.notificationsService.notifyUser(
            subject.project.productOwner.id,
            {
              type: NotificationType.INFO,
              title: 'Revisión académica habilitada',
              message: `Puede iniciar la revisión académica de "${name}".`,
              projectId,
              subjectId,
              eventType: NotificationEventType.INSTITUTIONAL_PLANNING_VALIDATED_LMS,
              actionUrl: `/subjects/${subjectId}`,
            },
            manager,
          );
        }
        void this.mailService.sendInstitutionalTransitionEmail({ subject, action: dto.action });
        break;
      case InstitutionalOperationalAction.PLANNING_RETURN_LMS:
        await notify(UserRole.LMS, 'Carga devuelta', `Planeación devolvió carga LMS de "${name}": ${dto.returnReason ?? dto.comment}`, NotificationEventType.INSTITUTIONAL_RETURNED_TO_LMS);
        void this.mailService.sendInstitutionalTransitionEmail({ subject, action: dto.action, reason: dto.returnReason ?? dto.comment });
        break;
      case InstitutionalOperationalAction.PRODUCT_REQUEST_CHANGES:
        await notify(UserRole.FABRICA, 'Correcciones académicas', `Product solicitó correcciones en "${name}".`, NotificationEventType.INSTITUTIONAL_PRODUCT_REQUESTED_CHANGES);
        void this.mailService.sendInstitutionalTransitionEmail({ subject, action: dto.action });
        break;
      case InstitutionalOperationalAction.PRODUCT_APPROVE_ACADEMIC:
        if (subject.project.productOwner?.id) {
          await this.notificationsService.notifyUser(
            subject.project.productOwner.id,
            {
              type: NotificationType.INFO,
              title: 'Asignatura aprobada académicamente',
              message: `"${name}" quedó pendiente de radicación del proyecto.`,
              projectId,
              subjectId,
              eventType: NotificationEventType.INSTITUTIONAL_PRODUCT_APPROVED_ACADEMIC,
              actionUrl: `/projects/${projectId}`,
            },
            manager,
          );
        }
        void this.mailService.sendInstitutionalTransitionEmail({ subject, action: dto.action });
        break;
      case InstitutionalOperationalAction.FACTORY_START_PRODUCTION:
        await notify(UserRole.PLANEACION, 'Producción iniciada', `Fábrica inició producción de "${name}".`, NotificationEventType.INSTITUTIONAL_FACTORY_DELIVERED);
        void this.mailService.sendInstitutionalTransitionEmail({ subject, action: dto.action });
        break;
      case InstitutionalOperationalAction.PRODUCT_START_ACADEMIC_REVIEW:
        if (subject.project.productOwner?.id) {
          await this.notificationsService.notifyUser(
            subject.project.productOwner.id,
            {
              type: NotificationType.INFO,
              title: 'Revisión académica iniciada',
              message: `Inició la revisión académica de "${name}".`,
              projectId,
              subjectId,
              eventType: NotificationEventType.INSTITUTIONAL_PLANNING_VALIDATED_LMS,
              actionUrl: `/subjects/${subjectId}`,
            },
            manager,
          );
        }
        break;
      case InstitutionalOperationalAction.PLANNING_FINALIZE:
        await notify(UserRole.PRODUCT, 'Asignatura finalizada', `"${name}" fue radicada y finalizada.`, NotificationEventType.INSTITUTIONAL_FINALIZED);
        await notify(UserRole.FABRICA, 'Asignatura finalizada', `"${name}" fue radicada y finalizada.`, NotificationEventType.INSTITUTIONAL_FINALIZED);
        await notify(UserRole.LMS, 'Asignatura finalizada', `"${name}" fue radicada y finalizada.`, NotificationEventType.INSTITUTIONAL_FINALIZED);
        void this.mailService.sendInstitutionalTransitionEmail({ subject, action: dto.action });
        break;
      default:
        break;
    }
  }
}
