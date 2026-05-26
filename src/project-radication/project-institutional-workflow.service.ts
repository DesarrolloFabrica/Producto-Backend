import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
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
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectEntity } from '../projects/project.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { UserEntity } from '../users/user.entity';
import { SubjectOperationalCheckEntity } from '../institutional-workflow/subject-operational-check.entity';
import { InstitutionalWorkflowSlaService } from '../institutional-workflow/institutional-workflow-sla.service';
import {
  ProjectRadicationReadinessDto,
} from './dto/project-radication-readiness.dto';
import { ProjectRadicationWorkItemDto } from './dto/project-radication-work-item.dto';
import {
  RegisterProjectRadicationDto,
  ReturnProjectRadicationDto,
} from './dto/register-project-radication.dto';
import { ProjectOperationalTransitionEntity } from './project-operational-transition.entity';
import { ProjectRadicationEntity } from './project-radication.entity';
import { ProjectRadicationReadinessService } from './project-radication-readiness.service';

@Injectable()
export class ProjectInstitutionalWorkflowService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(ProjectRadicationEntity)
    private readonly radicationRepo: Repository<ProjectRadicationEntity>,
    @InjectRepository(ProjectOperationalTransitionEntity)
    private readonly transitionRepo: Repository<ProjectOperationalTransitionEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    private readonly readinessService: ProjectRadicationReadinessService,
    private readonly slaService: InstitutionalWorkflowSlaService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
  ) {}

  async getReadiness(projectId: string, user: UserEntity): Promise<ProjectRadicationReadinessDto> {
    const project = await this.loadProject(projectId);
    this.assertCanView(project, user);
    return this.readinessService.getReadiness(projectId);
  }

  async registerRadication(
    projectId: string,
    dto: RegisterProjectRadicationDto,
    user: UserEntity,
  ): Promise<ProjectRadicationReadinessDto> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
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
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
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
    if (user.role !== UserRole.PLANEACION && user.role !== UserRole.ADMIN) {
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
    if (user.role !== UserRole.PLANEACION && user.role !== UserRole.ADMIN) {
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
    if (user.role !== UserRole.PLANEACION && user.role !== UserRole.ADMIN) {
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
