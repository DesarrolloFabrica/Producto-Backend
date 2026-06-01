import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { InstitutionalOperationalAction } from '../common/enums/institutional-operational-action.enum';
import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { NotificationEventType } from '../common/enums/notification-event-type.enum';
import { NotificationType } from '../common/enums/notification-type.enum';
import {
  OperationalCheckKey,
  OperationalCheckStatus,
} from '../common/enums/operational-check-key.enum';
import { ProjectInstitutionalAction } from '../common/enums/project-institutional-action.enum';
import { ProjectInstitutionalState } from '../common/enums/project-institutional-state.enum';
import { ProjectRadicationStatus } from '../common/enums/project-radication-status.enum';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { SubjectStatus } from '../common/enums/subject-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { AuditService } from '../audit/audit.service';
import { addBusinessDays } from '../common/utils/business-days.util';
import { NotificationsService } from '../notifications/notifications.service';
import { SemesterOperationalCheckEntity } from '../institutional-workflow/semester-operational-check.entity';
import { SemesterOperationalTransitionEntity } from '../institutional-workflow/semester-operational-transition.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { UserEntity } from '../users/user.entity';
import { SubjectOperationalCheckEntity } from '../institutional-workflow/subject-operational-check.entity';
import { InstitutionalWorkflowSlaService } from '../institutional-workflow/institutional-workflow-sla.service';
import { OPERATIONAL_CHECK_DEFINITIONS } from '../institutional-workflow/institutional-workflow.constants';
import {
  InstitutionalClosureTimelineEventDto,
  ProjectInstitutionalClosureDto,
} from './dto/project-institutional-closure.dto';
import { ProjectRadicationReadinessDto } from './dto/project-radication-readiness.dto';
import { ProjectRadicationWorkItemDto } from './dto/project-radication-work-item.dto';
import {
  RegisterProjectRadicationDto,
  ReturnProjectRadicationDto,
} from './dto/register-project-radication.dto';
import { ProjectOperationalTransitionEntity } from './project-operational-transition.entity';
import { ProjectRadicationEntity } from './project-radication.entity';
import { ProjectRadicationReadinessService } from './project-radication-readiness.service';
import { SemesterOperationalWorkflowService } from '../institutional-workflow/semester-operational-workflow.service';

@Injectable()
export class ProjectInstitutionalWorkflowService {
  private readonly logger = new Logger(ProjectInstitutionalWorkflowService.name);

  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(ProjectRadicationEntity)
    private readonly radicationRepo: Repository<ProjectRadicationEntity>,
    @InjectRepository(ProjectOperationalTransitionEntity)
    private readonly transitionRepo: Repository<ProjectOperationalTransitionEntity>,
    @InjectRepository(SemesterOperationalTransitionEntity)
    private readonly semesterTransitionRepo: Repository<SemesterOperationalTransitionEntity>,
    @InjectRepository(SemesterOperationalCheckEntity)
    private readonly semesterCheckRepo: Repository<SemesterOperationalCheckEntity>,
    @InjectRepository(SemesterEntity)
    private readonly semesterRepo: Repository<SemesterEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    private readonly readinessService: ProjectRadicationReadinessService,
    private readonly slaService: InstitutionalWorkflowSlaService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => SemesterOperationalWorkflowService))
    private readonly semesterOperationalWorkflow: SemesterOperationalWorkflowService,
  ) {}

  async getReadiness(projectId: string, user: UserEntity): Promise<ProjectRadicationReadinessDto> {
    const project = await this.loadProject(projectId);
    this.assertCanView(project, user);
    await this.projectRepo.manager.transaction(async (manager) => {
      try {
        await this.semesterOperationalWorkflow.syncSemestersWhenAllSubjectsReadyForRadication(
          projectId,
          manager,
          user,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Sync de cierre académico omitido para proyecto ${projectId}: ${message}`,
        );
      }
      await this.readinessService.recalculateAndUpdateProjectState(projectId, manager, user.id);
    });
    return this.readinessService.getReadiness(projectId);
  }

  async getInstitutionalClosure(
    projectId: string,
    user: UserEntity,
  ): Promise<ProjectInstitutionalClosureDto> {
    const project = await this.loadProject(projectId);
    this.assertCanView(project, user);

    if (!this.readinessService.usesProjectRadication(project)) {
      throw new BadRequestException('Este proyecto no usa el flujo institucional de cierre');
    }

    const readiness = await this.readinessService.getReadiness(projectId);
    if (readiness.projectInstitutionalState !== ProjectInstitutionalState.FINALIZED) {
      throw new BadRequestException('La solicitud aún no está finalizada');
    }

    const semesters = await this.semesterRepo.find({
      where: {
        project: { id: projectId },
        deletedAt: IsNull(),
        createdFromChange: false,
      },
      order: { semesterNumber: 'ASC' },
    });
    const semesterIds = semesters.map((s) => s.id);

    const checkRows =
      semesterIds.length > 0
        ? await this.semesterCheckRepo.find({
            where: { semester: { id: In(semesterIds) } },
            relations: { checkedBy: true, semester: true },
          })
        : [];

    const checks = OPERATIONAL_CHECK_DEFINITIONS.map((def) => {
      const matches = checkRows.filter((row) => row.checkKey === def.key);
      const checkedRows = matches.filter((row) => row.status === OperationalCheckStatus.CHECKED);
      const latest = [...checkedRows].sort(
        (a, b) => (b.checkedAt?.getTime() ?? 0) - (a.checkedAt?.getTime() ?? 0),
      )[0];

      return {
        key: def.key,
        label: def.label,
        responsibleRole: def.responsibleRole,
        status: OperationalCheckStatus.CHECKED,
        checkedAt: (latest?.checkedAt ?? project.radicatedAt ?? project.updatedAt).toISOString(),
        checkedByName: latest?.checkedBy?.name ?? null,
      };
    });

    const [semesterTransitions, projectTransitions] = await Promise.all([
      semesterIds.length > 0
        ? this.semesterTransitionRepo.find({
            where: { semester: { id: In(semesterIds) } },
            relations: { actor: true, semester: true },
            order: { createdAt: 'ASC' },
          })
        : Promise.resolve([]),
      this.transitionRepo.find({
        where: { project: { id: projectId } },
        relations: { actor: true },
        order: { createdAt: 'ASC' },
      }),
    ]);

    const rawTimeline: InstitutionalClosureTimelineEventDto[] = [
      ...semesterTransitions.map((t) => ({
        id: t.id,
        action: t.action,
        scopeLabel: `Semestre ${t.semester.semesterNumber}`,
        actorName: t.actor.name,
        actorRole: t.actorRole,
        comment: t.comment,
        returnReason: t.returnReason,
        createdAt: t.createdAt.toISOString(),
      })),
      ...projectTransitions.map((t) => ({
        id: t.id,
        action: t.action,
        scopeLabel: 'Radicación de solicitud',
        actorName: t.actor.name,
        actorRole: t.actorRole,
        comment: t.comment,
        returnReason: t.returnReason,
        createdAt: t.createdAt.toISOString(),
      })),
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const timeline = ProjectInstitutionalWorkflowService.consolidateClosureTimeline(rawTimeline);

    return {
      projectId: project.id,
      program: project.program,
      school: project.school,
      projectInstitutionalState: readiness.projectInstitutionalState,
      radicationNumber: project.radicationNumber,
      radicatedAt: project.radicatedAt?.toISOString() ?? null,
      scopeSubjectsApproved: readiness.scope.subjectsApproved,
      scopeSubjectsTotal: readiness.scope.subjectsTotal,
      scopeSemesters: readiness.scope.semesters,
      checks,
      timeline,
      timelineRawCount: rawTimeline.length,
    };
  }

  private static isSemesterScopeLabel(scopeLabel: string | null): boolean {
    return Boolean(scopeLabel?.startsWith('Semestre'));
  }

  private static semesterSortKey(scopeLabel: string): number {
    const match = scopeLabel.match(/Semestre\s+(\d+)/i);
    return match ? Number(match[1]) : 0;
  }

  /** Agrupa transiciones paralelas por semestre en hitos únicos para la vista de cierre. */
  static consolidateClosureTimeline(
    events: InstitutionalClosureTimelineEventDto[],
  ): InstitutionalClosureTimelineEventDto[] {
    const projectLevel: InstitutionalClosureTimelineEventDto[] = [];
    const semesterGroups = new Map<
      string,
      InstitutionalClosureTimelineEventDto & { scopeLabels: string[]; mergedCount: number }
    >();

    for (const event of events) {
      if (!ProjectInstitutionalWorkflowService.isSemesterScopeLabel(event.scopeLabel)) {
        projectLevel.push(event);
        continue;
      }

      const groupKey = `${event.action}|${event.actorRole}`;
      const existing = semesterGroups.get(groupKey);
      const scope = event.scopeLabel!;

      if (!existing) {
        semesterGroups.set(groupKey, {
          ...event,
          scopeLabels: [scope],
          mergedCount: 1,
        });
        continue;
      }

      existing.mergedCount += 1;
      if (!existing.scopeLabels.includes(scope)) {
        existing.scopeLabels.push(scope);
      }
      if (new Date(event.createdAt).getTime() < new Date(existing.createdAt).getTime()) {
        existing.createdAt = event.createdAt;
        existing.actorName = event.actorName;
        existing.id = event.id;
      }
      if (event.returnReason && !existing.returnReason) {
        existing.returnReason = event.returnReason;
      }
      if (event.comment && !existing.comment) {
        existing.comment = event.comment;
      }
    }

    const mergedSemester = [...semesterGroups.values()].map((group) => {
      const sortedScopes = [...group.scopeLabels].sort(
        (a, b) =>
          ProjectInstitutionalWorkflowService.semesterSortKey(a) -
          ProjectInstitutionalWorkflowService.semesterSortKey(b),
      );
      const scopeLabel =
        sortedScopes.length > 1 ? sortedScopes.join(' · ') : sortedScopes[0] ?? null;

      return {
        id: group.id,
        action: group.action,
        scopeLabel,
        actorName: group.actorName,
        actorRole: group.actorRole,
        comment: group.comment,
        returnReason: group.returnReason,
        createdAt: group.createdAt,
        mergedCount: group.mergedCount > 1 ? group.mergedCount : undefined,
      };
    });

    return [...projectLevel, ...mergedSemester].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }

  async registerRadication(
    projectId: string,
    dto: RegisterProjectRadicationDto,
    user: UserEntity,
  ): Promise<ProjectRadicationReadinessDto> {
    if (user.role !== UserRole.PRODUCT) {
      throw new ForbiddenException('Solo Product puede registrar radicados');
    }

    await this.projectRepo.manager.transaction(async (manager) => {
      const project = await this.loadProjectInTx(manager, projectId);
      this.assertProductOwner(project, user);

      if (project.institutionalState !== ProjectInstitutionalState.READY_FOR_PRODUCT_RADICATION) {
        throw new BadRequestException('El proyecto no está listo para radicación');
      }

      const readiness = await this.readinessService.getReadiness(projectId, manager);
      if (!readiness.ready) {
        throw new BadRequestException({
          message: 'No se puede radicar: hay materias pendientes en el alcance inicial',
          blockers: readiness.blockers,
        });
      }

      const radicatedAt = new Date(dto.radicatedAt);
      const fromState = project.institutionalState;
      const toState = ProjectInstitutionalState.PENDING_PLANNING_RADICATION_CHECK;
      const planningDays = this.planningCheckBusinessDays();

      await this.supersedeActiveRadications(projectId, manager);

      const radicationRepo = manager.getRepository(ProjectRadicationEntity);
      await radicationRepo.save(
        radicationRepo.create({
          project: { id: projectId },
          radicationNumber: dto.radicationNumber.trim(),
          radicatedAt,
          registeredBy: { id: user.id },
          comment: dto.comment?.trim() ?? null,
          evidenceUrl: dto.evidenceUrl?.trim() ?? null,
          status: ProjectRadicationStatus.ACTIVE,
        }),
      );

      const projectRepo = manager.getRepository(ProjectEntity);
      await projectRepo.update(projectId, {
        institutionalState: toState,
        radicationNumber: dto.radicationNumber.trim(),
        radicatedAt,
        radicatedBy: { id: user.id },
        radicationComment: dto.comment?.trim() ?? null,
        radicationEvidenceUrl: dto.evidenceUrl?.trim() ?? null,
        planningRadicationCheckDueAt: addBusinessDays(radicatedAt, planningDays),
        lastRadicationReturnReason: null,
        lastRadicationReturnedAt: null,
      });

      await this.recordProjectTransition(manager, {
        projectId,
        fromState,
        toState,
        action: ProjectInstitutionalAction.PRODUCT_REGISTER_RADICATION,
        user,
        comment: dto.comment ?? null,
        evidenceUrl: dto.evidenceUrl ?? null,
        radicationNumber: dto.radicationNumber.trim(),
      });

      await this.auditService.createLog(
        {
          entityType: 'PROJECT',
          entityId: projectId,
          action: AuditAction.STATUS_CHANGE,
          userId: user.id,
          beforeJson: { institutionalState: fromState },
          afterJson: {
            institutionalState: toState,
            radicationNumber: dto.radicationNumber,
            radicatedAt: radicatedAt.toISOString(),
          },
        },
        manager,
      );

      await this.notificationsService.notifyRole(
        UserRole.PLANEACION,
        {
          type: NotificationType.INFO,
          title: 'Solicitud radicada por Product',
          message: `Product registró radicado ${dto.radicationNumber} para ${project.program}.`,
          projectId,
          eventType: NotificationEventType.PRODUCT_REGISTERED_RADICATION,
          actionUrl: `/projects/${projectId}`,
        },
        manager,
      );
    });

    return this.getReadiness(projectId, user);
  }

  async resubmitRadication(
    projectId: string,
    dto: RegisterProjectRadicationDto,
    user: UserEntity,
  ): Promise<ProjectRadicationReadinessDto> {
    if (user.role !== UserRole.PRODUCT) {
      throw new ForbiddenException('Solo Product puede reenviar radicados');
    }

    await this.projectRepo.manager.transaction(async (manager) => {
      const project = await this.loadProjectInTx(manager, projectId);
      this.assertProductOwner(project, user);

      if (project.institutionalState !== ProjectInstitutionalState.RADICATION_RETURNED_TO_PRODUCT) {
        throw new BadRequestException('El proyecto no tiene un radicado devuelto');
      }

      const radicatedAt = new Date(dto.radicatedAt);
      const fromState = project.institutionalState;
      const toState = ProjectInstitutionalState.PENDING_PLANNING_RADICATION_CHECK;

      await this.supersedeActiveRadications(projectId, manager);

      const radicationRepo = manager.getRepository(ProjectRadicationEntity);
      await radicationRepo.save(
        radicationRepo.create({
          project: { id: projectId },
          radicationNumber: dto.radicationNumber.trim(),
          radicatedAt,
          registeredBy: { id: user.id },
          comment: dto.comment?.trim() ?? null,
          evidenceUrl: dto.evidenceUrl?.trim() ?? null,
          status: ProjectRadicationStatus.ACTIVE,
        }),
      );

      const projectRepo = manager.getRepository(ProjectEntity);
      await projectRepo.update(projectId, {
        institutionalState: toState,
        radicationNumber: dto.radicationNumber.trim(),
        radicatedAt,
        radicatedBy: { id: user.id },
        radicationComment: dto.comment?.trim() ?? null,
        radicationEvidenceUrl: dto.evidenceUrl?.trim() ?? null,
        planningRadicationCheckDueAt: addBusinessDays(radicatedAt, this.planningCheckBusinessDays()),
        lastRadicationReturnReason: null,
        lastRadicationReturnedAt: null,
      });

      await this.recordProjectTransition(manager, {
        projectId,
        fromState,
        toState,
        action: ProjectInstitutionalAction.PRODUCT_RESUBMIT_RADICATION,
        user,
        comment: dto.comment ?? null,
        evidenceUrl: dto.evidenceUrl ?? null,
        radicationNumber: dto.radicationNumber.trim(),
      });

      await this.notificationsService.notifyRole(
        UserRole.PLANEACION,
        {
          type: NotificationType.INFO,
          title: 'Radicado reenviado por Product',
          message: `Product reenvió radicado ${dto.radicationNumber} para ${project.program}.`,
          projectId,
          eventType: NotificationEventType.PRODUCT_RESUBMITTED_RADICATION,
          actionUrl: `/projects/${projectId}`,
        },
        manager,
      );
    });

    return this.getReadiness(projectId, user);
  }

  async validateRadication(projectId: string, user: UserEntity): Promise<ProjectRadicationReadinessDto> {
    if (user.role !== UserRole.PLANEACION) {
      throw new ForbiddenException('Solo Planeación puede validar radicados');
    }

    await this.projectRepo.manager.transaction(async (manager) => {
      const project = await this.loadProjectInTx(manager, projectId);

      if (project.institutionalState !== ProjectInstitutionalState.PENDING_PLANNING_RADICATION_CHECK) {
        throw new BadRequestException('El proyecto no tiene un radicado pendiente de validación');
      }

      const fromState = project.institutionalState;
      const toState = ProjectInstitutionalState.FINALIZED;
      const now = new Date();

      const radicationRepo = manager.getRepository(ProjectRadicationEntity);
      const activeRadication = await radicationRepo.findOne({
        where: { project: { id: projectId }, status: ProjectRadicationStatus.ACTIVE },
        order: { createdAt: 'DESC' },
      });
      if (activeRadication) {
        activeRadication.status = ProjectRadicationStatus.VALIDATED;
        activeRadication.validatedAt = now;
        activeRadication.validatedBy = { id: user.id } as UserEntity;
        await radicationRepo.save(activeRadication);
      }

      const scopeSubjects = await this.loadScopeSubjects(projectId, manager);
      const subjectRepo = manager.getRepository(SubjectEntity);
      const checkRepo = manager.getRepository(SubjectOperationalCheckEntity);

      for (const subject of scopeSubjects) {
        if (subject.operationalState === InstitutionalOperationalState.FINALIZED) continue;

        const fromSubjectState = subject.operationalState;
        await subjectRepo.update(subject.id, {
          operationalState: InstitutionalOperationalState.FINALIZED,
          operationalFinalizedAt: now,
          operationalStageEnteredAt: now,
          operationalStageDueAt: this.slaService.computeStageDueAt(
            now,
            InstitutionalOperationalState.FINALIZED,
          ),
          status: SubjectStatus.APPROVED,
        });

        const check = await checkRepo.findOne({
          where: {
            subject: { id: subject.id },
            checkKey: OperationalCheckKey.PLANNING_FINAL_RADICATED,
          },
        });
        if (check) {
          check.status = OperationalCheckStatus.CHECKED;
          check.checkedAt = now;
          check.checkedBy = { id: user.id } as UserEntity;
          await checkRepo.save(check);
        }
      }

      await this.finalizeScopeSemesters(projectId, user, manager, now);

      const projectRepo = manager.getRepository(ProjectEntity);
      await projectRepo.update(projectId, {
        institutionalState: toState,
        status: ProjectStatus.CLOSED,
      });

      await this.recordProjectTransition(manager, {
        projectId,
        fromState,
        toState,
        action: ProjectInstitutionalAction.PLANNING_VALIDATE_RADICATION,
        user,
        radicationNumber: project.radicationNumber,
      });

      await this.auditService.createLog(
        {
          entityType: 'PROJECT',
          entityId: projectId,
          action: AuditAction.STATUS_CHANGE,
          userId: user.id,
          beforeJson: { institutionalState: fromState },
          afterJson: { institutionalState: toState, radicationNumber: project.radicationNumber },
        },
        manager,
      );

      if (project.productOwner?.id) {
        await this.notificationsService.notifyUser(
          project.productOwner.id,
          {
            type: NotificationType.INFO,
            title: 'Solicitud finalizada',
            message: `Planeación validó el radicado ${project.radicationNumber ?? ''} de ${project.program}.`,
            projectId,
            eventType: NotificationEventType.PLANNING_RADICATION_VALIDATED,
            actionUrl: `/projects/${projectId}`,
          },
          manager,
        );
      }

      await this.notificationsService.notifyRole(
        UserRole.FABRICA,
        {
          type: NotificationType.INFO,
          title: 'Solicitud finalizada',
          message: `La solicitud ${project.program} fue validada y cerrada.`,
          projectId,
          eventType: NotificationEventType.PROJECT_FINALIZED,
          actionUrl: `/projects/${projectId}`,
        },
        manager,
      );

      await this.notificationsService.notifyRole(
        UserRole.LMS,
        {
          type: NotificationType.INFO,
          title: 'Solicitud finalizada',
          message: `La solicitud ${project.program} fue validada y cerrada.`,
          projectId,
          eventType: NotificationEventType.PROJECT_FINALIZED,
          actionUrl: `/projects/${projectId}`,
        },
        manager,
      );
    });

    return this.getReadiness(projectId, user);
  }

  async returnRadication(
    projectId: string,
    dto: ReturnProjectRadicationDto,
    user: UserEntity,
  ): Promise<ProjectRadicationReadinessDto> {
    if (user.role !== UserRole.PLANEACION) {
      throw new ForbiddenException('Solo Planeación puede devolver radicados');
    }

    await this.projectRepo.manager.transaction(async (manager) => {
      const project = await this.loadProjectInTx(manager, projectId);

      if (project.institutionalState !== ProjectInstitutionalState.PENDING_PLANNING_RADICATION_CHECK) {
        throw new BadRequestException('El proyecto no tiene un radicado pendiente de validación');
      }

      const now = new Date();
      const fromState = project.institutionalState;
      const toState = ProjectInstitutionalState.RADICATION_RETURNED_TO_PRODUCT;
      const reason = dto.returnReason.trim();

      const radicationRepo = manager.getRepository(ProjectRadicationEntity);
      const activeRadication = await radicationRepo.findOne({
        where: { project: { id: projectId }, status: ProjectRadicationStatus.ACTIVE },
        order: { createdAt: 'DESC' },
      });
      if (activeRadication) {
        activeRadication.status = ProjectRadicationStatus.RETURNED;
        activeRadication.returnReason = reason;
        activeRadication.returnedAt = now;
        activeRadication.returnedBy = { id: user.id } as UserEntity;
        await radicationRepo.save(activeRadication);
      }

      const projectRepo = manager.getRepository(ProjectEntity);
      await projectRepo.update(projectId, {
        institutionalState: toState,
        lastRadicationReturnReason: reason,
        lastRadicationReturnedAt: now,
      });

      await this.recordProjectTransition(manager, {
        projectId,
        fromState,
        toState,
        action: ProjectInstitutionalAction.PLANNING_RETURN_RADICATION,
        user,
        returnReason: reason,
      });

      if (project.productOwner?.id) {
        await this.notificationsService.notifyUser(
          project.productOwner.id,
          {
            type: NotificationType.CRITICAL,
            title: 'Radicado devuelto',
            message: `Planeación devolvió el radicado de ${project.program}: ${reason}`,
            projectId,
            eventType: NotificationEventType.PLANNING_RADICATION_RETURNED,
            actionUrl: `/projects/${projectId}`,
          },
          manager,
        );
      }
    });

    return this.getReadiness(projectId, user);
  }

  async listProductRadicationWork(user: UserEntity): Promise<ProjectRadicationWorkItemDto[]> {
    const states = [
      ProjectInstitutionalState.READY_FOR_PRODUCT_RADICATION,
      ProjectInstitutionalState.RADICATION_RETURNED_TO_PRODUCT,
      ProjectInstitutionalState.INSTITUTIONAL_IN_PROGRESS,
    ];

    const qb = this.projectRepo
      .createQueryBuilder('p')
      .where('p.deletedAt IS NULL')
      .andWhere('p.legacyWorkflow = false')
      .andWhere('p.institutionalState IN (:...states)', { states });

    if (user.role === UserRole.PRODUCT) {
      qb.andWhere('p.productOwnerId = :ownerId', { ownerId: user.id });
    }

    const projects = await qb.orderBy('p.productRadicationDueAt', 'ASC', 'NULLS LAST').getMany();
    return Promise.all(projects.map((p) => this.toWorkItem(p)));
  }

  async listPlanningRadicationWork(user: UserEntity): Promise<ProjectRadicationWorkItemDto[]> {
    if (user.role !== UserRole.PLANEACION) {
      throw new ForbiddenException();
    }

    const projects = await this.projectRepo.find({
      where: {
        deletedAt: IsNull(),
        legacyWorkflow: false,
        institutionalState: ProjectInstitutionalState.PENDING_PLANNING_RADICATION_CHECK,
      },
      order: { planningRadicationCheckDueAt: 'ASC' },
    });

    return Promise.all(projects.map((p) => this.toWorkItem(p)));
  }

  async lockScopeIfNeeded(projectId: string, manager: EntityManager): Promise<void> {
    const projectRepo = manager.getRepository(ProjectEntity);
    const project = await projectRepo.findOne({ where: { id: projectId } });
    if (!project || project.institutionalScopeLockedAt) return;
    if (!this.readinessService.usesProjectRadication(project)) return;

    await projectRepo.update(projectId, { institutionalScopeLockedAt: new Date() });
  }

  async onSubjectApprovedForRadication(
    projectId: string,
    manager: EntityManager,
    user: UserEntity,
  ): Promise<void> {
    await this.semesterOperationalWorkflow.syncSemestersWhenAllSubjectsReadyForRadication(
      projectId,
      manager,
      user,
    );
    await this.readinessService.recalculateAndUpdateProjectState(projectId, manager);

    const projectRepo = manager.getRepository(ProjectEntity);
    const project = await projectRepo.findOne({
      where: { id: projectId },
      relations: { productOwner: true },
    });
    if (
      project?.institutionalState === ProjectInstitutionalState.READY_FOR_PRODUCT_RADICATION &&
      project.productOwner?.id
    ) {
      await this.notificationsService.notifyUser(
        project.productOwner.id,
        {
          type: NotificationType.INFO,
          title: 'Solicitud lista para radicación',
          message: `Todas las materias del alcance inicial están aprobadas. Puede registrar el radicado de ${project.program}.`,
          projectId,
          eventType: NotificationEventType.PROJECT_READY_FOR_RADICATION,
          actionUrl: `/projects/${projectId}`,
        },
        manager,
      );
    }
  }

  private async toWorkItem(project: ProjectEntity): Promise<ProjectRadicationWorkItemDto> {
    const readiness = await this.readinessService.getReadiness(project.id);
    return {
      projectId: project.id,
      school: project.school,
      program: project.program,
      institutionalState: project.institutionalState!,
      radicationNumber: project.radicationNumber,
      radicatedAt: project.radicatedAt,
      scopeSubjectsTotal: readiness.scope.subjectsTotal,
      scopeSubjectsApproved: readiness.scope.subjectsApproved,
      productRadicationDueAt: project.productRadicationDueAt,
      planningRadicationCheckDueAt: project.planningRadicationCheckDueAt,
      lastRadicationReturnReason: project.lastRadicationReturnReason,
    };
  }

  private async loadScopeSubjects(projectId: string, manager: EntityManager): Promise<SubjectEntity[]> {
    return manager
      .getRepository(SubjectEntity)
      .createQueryBuilder('s')
      .innerJoin('s.semester', 'sem')
      .where('s.projectId = :projectId', { projectId })
      .andWhere('s.deletedAt IS NULL')
      .andWhere('sem.deletedAt IS NULL')
      .andWhere('sem.createdFromChange = false')
      .andWhere('s.createdFromChange = false')
      .getMany();
  }

  private async loadScopeSemesters(projectId: string, manager: EntityManager): Promise<SemesterEntity[]> {
    return manager
      .getRepository(SemesterEntity)
      .createQueryBuilder('sem')
      .where('sem.projectId = :projectId', { projectId })
      .andWhere('sem.deletedAt IS NULL')
      .andWhere('sem.createdFromChange = false')
      .getMany();
  }

  private async finalizeScopeSemesters(
    projectId: string,
    user: UserEntity,
    manager: EntityManager,
    now: Date,
  ): Promise<void> {
    const semesterRepo = manager.getRepository(SemesterEntity);
    const transitionRepo = manager.getRepository(SemesterOperationalTransitionEntity);
    const checkRepo = manager.getRepository(SemesterOperationalCheckEntity);
    const semesters = await this.loadScopeSemesters(projectId, manager);

    for (const semester of semesters) {
      if (semester.operationalState === InstitutionalOperationalState.FINALIZED) {
        continue;
      }

      const fromState = semester.operationalState;
      const result = await semesterRepo.update(
        { id: semester.id, operationalState: fromState, lockVersion: semester.lockVersion },
        {
          operationalState: InstitutionalOperationalState.FINALIZED,
          operationalFinalizedAt: now,
          operationalStageEnteredAt: now,
          operationalStageDueAt: this.slaService.computeStageDueAt(
            now,
            InstitutionalOperationalState.FINALIZED,
          ),
          lockVersion: semester.lockVersion + 1,
        },
      );
      if (!result.affected) {
        throw new ConflictException(
          `No se pudo finalizar el semestre ${semester.semesterNumber}. Recargue e intente de nuevo.`,
        );
      }

      await transitionRepo.save(
        transitionRepo.create({
          semester: { id: semester.id },
          fromState,
          toState: InstitutionalOperationalState.FINALIZED,
          action: InstitutionalOperationalAction.PLANNING_FINALIZE,
          actor: { id: user.id },
          actorRole: user.role,
          comment: 'Radicación validada — cierre institucional del semestre',
          metadata: { source: 'project_radication_validate' },
        }),
      );

      const semesterCheck = await checkRepo.findOne({
        where: {
          semester: { id: semester.id },
          checkKey: OperationalCheckKey.PLANNING_FINAL_RADICATED,
        },
      });
      if (semesterCheck) {
        semesterCheck.status = OperationalCheckStatus.CHECKED;
        semesterCheck.checkedAt = now;
        semesterCheck.checkedBy = { id: user.id } as UserEntity;
        await checkRepo.save(semesterCheck);
      }
    }
  }

  private async supersedeActiveRadications(projectId: string, manager: EntityManager): Promise<void> {
    const radicationRepo = manager.getRepository(ProjectRadicationEntity);
    await radicationRepo.update(
      { project: { id: projectId }, status: ProjectRadicationStatus.ACTIVE },
      { status: ProjectRadicationStatus.SUPERSEDED },
    );
  }

  private async recordProjectTransition(
    manager: EntityManager,
    params: {
      projectId: string;
      fromState: ProjectInstitutionalState | null;
      toState: ProjectInstitutionalState;
      action: ProjectInstitutionalAction;
      user: UserEntity;
      comment?: string | null;
      returnReason?: string | null;
      evidenceUrl?: string | null;
      radicationNumber?: string | null;
    },
  ): Promise<void> {
    const transitionRepo = manager.getRepository(ProjectOperationalTransitionEntity);
    await transitionRepo.save(
      transitionRepo.create({
        project: { id: params.projectId },
        fromState: params.fromState,
        toState: params.toState,
        action: params.action,
        actor: { id: params.user.id },
        actorRole: params.user.role,
        comment: params.comment ?? null,
        returnReason: params.returnReason ?? null,
        evidenceUrl: params.evidenceUrl ?? null,
        radicationNumber: params.radicationNumber ?? null,
      }),
    );
  }

  private async loadProject(projectId: string): Promise<ProjectEntity> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId, deletedAt: IsNull() },
      relations: { productOwner: true },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    return project;
  }

  private async loadProjectInTx(manager: EntityManager, projectId: string): Promise<ProjectEntity> {
    const project = await manager.getRepository(ProjectEntity).findOne({
      where: { id: projectId, deletedAt: IsNull() },
      relations: { productOwner: true },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado');
    if (!this.readinessService.usesProjectRadication(project)) {
      throw new BadRequestException('Este proyecto no usa radicación institucional por solicitud');
    }
    return project;
  }

  private assertCanView(project: ProjectEntity, user: UserEntity): void {
    if (user.role === UserRole.ADMIN || user.role === UserRole.PLANEACION) return;
    if (user.role === UserRole.LMS || user.role === UserRole.FABRICA) return;
    if (user.role === UserRole.PRODUCT && project.productOwner?.id === user.id) return;
    throw new ForbiddenException('No tiene permisos sobre este proyecto');
  }

  private assertProductOwner(project: ProjectEntity, user: UserEntity): void {
    if (user.role === UserRole.ADMIN) return;
    if (user.role === UserRole.PRODUCT && project.productOwner?.id === user.id) return;
    throw new ForbiddenException('No tiene permisos sobre este proyecto');
  }

  private productRadicationBusinessDays(): number {
    const raw = process.env.PRODUCT_RADICATION_BUSINESS_DAYS;
    const n = raw ? Number(raw) : 5;
    return Number.isInteger(n) && n > 0 ? n : 5;
  }

  private planningCheckBusinessDays(): number {
    const raw = process.env.PLANNING_RADICATION_CHECK_BUSINESS_DAYS;
    const n = raw ? Number(raw) : 3;
    return Number.isInteger(n) && n > 0 ? n : 3;
  }
}
