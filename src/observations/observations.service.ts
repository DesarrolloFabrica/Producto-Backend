import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { ChecklistStatus } from '../common/enums/checklist-status.enum';
import { ObservationNotificationStatus } from '../common/enums/observation-notification-status.enum';
import { ObservationStatus } from '../common/enums/observation-status.enum';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { SubjectStatus } from '../common/enums/subject-status.enum';
import { RelatedEntityType } from '../common/enums/related-entity-type.enum';
import { NotificationEventType } from '../common/enums/notification-event-type.enum';
import { NotificationType } from '../common/enums/notification-type.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { isReducedInstitutionalFlow } from '../institutional-workflow/institutional-workflow.config';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { StatusHistoryService } from '../audit/status-history.service';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { ProjectEntity } from '../projects/project.entity';
import { ProjectsService } from '../projects/projects.service';
import { ProjectOwnerDto } from '../projects/dto/project-response.dto';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { TopicEntity } from '../topics/topic.entity';
import { UserEntity } from '../users/user.entity';
import { ProgressService } from '../workflow/progress.service';
import { ProjectWorkflowService } from '../workflow/project-workflow.service';
import { SemesterWorkflowService } from '../workflow/semester-workflow.service';
import { SubjectWorkflowService } from '../workflow/subject-workflow.service';
import { CreateObservationMessageDto } from './dto/create-observation-message.dto';
import { CreateObservationDto } from './dto/create-observation.dto';
import {
  ObservationMessageResponseDto,
  ObservationResponseDto,
} from './dto/observation-response.dto';
import { UpdateObservationStatusResponseDto } from './dto/update-observation-status-response.dto';
import { ObservationMessageEntity } from './observation-message.entity';
import { ObservationEntity } from './observation.entity';

// Only fully open observations that were sent to Fábrica block delivery/review.
const BLOCKING_STATUSES = [ObservationStatus.ABIERTA];
const UNRESOLVED_STATUSES = [ObservationStatus.ABIERTA, ObservationStatus.EN_CORRECCION];

@Injectable()
export class ObservationsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(ObservationEntity)
    private readonly observationRepo: Repository<ObservationEntity>,
    @InjectRepository(ObservationMessageEntity)
    private readonly messageRepo: Repository<ObservationMessageEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(TopicEntity)
    private readonly topicRepo: Repository<TopicEntity>,
    @InjectRepository(ChecklistItemEntity)
    private readonly checklistRepo: Repository<ChecklistItemEntity>,
    @InjectRepository(SemesterEntity)
    private readonly semesterRepo: Repository<SemesterEntity>,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
    private readonly auditService: AuditService,
    private readonly statusHistoryService: StatusHistoryService,
    private readonly progressService: ProgressService,
    private readonly subjectWorkflowService: SubjectWorkflowService,
    private readonly semesterWorkflowService: SemesterWorkflowService,
    private readonly projectWorkflowService: ProjectWorkflowService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async hasBlockingObservationsForSubject(
    subjectId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const count = await this.countObservationsForSubjectByStatuses(
      subjectId,
      BLOCKING_STATUSES,
      manager,
    );
    return count > 0;
  }

  async hasUnresolvedObservationsForSubject(
    subjectId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const count = await this.countObservationsForSubjectByStatuses(
      subjectId,
      UNRESOLVED_STATUSES,
      manager,
    );
    return count > 0;
  }

  async countUnresolvedObservationsForSubject(
    subjectId: string,
    manager?: EntityManager,
  ): Promise<number> {
    return this.countObservationsForSubjectByStatuses(subjectId, UNRESOLVED_STATUSES, manager);
  }

  /** Conteos agrupados por asignatura para un semestre (evita N+1 en operational-workspace). */
  async countObservationStatsForSemester(
    semesterId: string,
    manager?: EntityManager,
  ): Promise<{ unresolvedBySubject: Map<string, number>; blockingBySubject: Map<string, number> }> {
    const em = manager ?? this.semesterRepo.manager;

    const [unresolvedRows, blockingRows] = await Promise.all([
      this.queryObservationCountsBySemester(semesterId, UNRESOLVED_STATUSES, em),
      this.queryObservationCountsBySemester(semesterId, BLOCKING_STATUSES, em, true),
    ]);

    return {
      unresolvedBySubject: this.rowsToCountMap(unresolvedRows),
      blockingBySubject: this.rowsToCountMap(blockingRows),
    };
  }

  /** Conteos agrupados por asignatura del alcance inicial de radicación (evita N+1 en readiness). */
  async countObservationStatsForRadicationScope(
    projectId: string,
    manager?: EntityManager,
  ): Promise<{ unresolvedBySubject: Map<string, number>; blockingBySubject: Map<string, number> }> {
    const em = manager ?? this.semesterRepo.manager;

    const [unresolvedRows, blockingRows] = await Promise.all([
      this.queryObservationCountsByRadicationScope(projectId, UNRESOLVED_STATUSES, em),
      this.queryObservationCountsByRadicationScope(projectId, BLOCKING_STATUSES, em, true),
    ]);

    return {
      unresolvedBySubject: this.rowsToCountMap(unresolvedRows),
      blockingBySubject: this.rowsToCountMap(blockingRows),
    };
  }

  private rowsToCountMap(rows: { subjectId: string; count: number }[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.subjectId, Number(row.count ?? 0));
    }
    return map;
  }

  private async queryObservationCountsByRadicationScope(
    projectId: string,
    statuses: ObservationStatus[],
    manager: EntityManager,
    requireSentNotification = false,
  ): Promise<{ subjectId: string; count: number }[]> {
    const notificationFilter = requireSentNotification
      ? `AND o."notificationStatus" = 'SENT'`
      : `AND (
          o.status != 'ABIERTA'
          OR o."notificationStatus" = 'SENT'
        )`;

    return manager.query(
      `SELECT s.id AS "subjectId", COUNT(DISTINCT o.id)::int AS count
       FROM subjects s
       INNER JOIN semesters sem ON sem.id = s."semesterId"
       INNER JOIN observations o ON (
         o."subjectId" = s.id
         OR (o."relatedEntityType" = $3 AND o."relatedEntityId" = s.id)
         OR o."topicId" IN (
           SELECT t.id FROM topics t
           WHERE t."subjectId" = s.id AND t."deletedAt" IS NULL
         )
         OR o."checklistItemId" IN (
           SELECT c.id FROM checklist_items c WHERE c."subjectId" = s.id
         )
       )
       WHERE s."projectId" = $1
         AND s."deletedAt" IS NULL
         AND sem."deletedAt" IS NULL
         AND sem.created_from_change = false
         AND s.created_from_change = false
         AND o.status = ANY($2)
         ${notificationFilter}
       GROUP BY s.id`,
      [projectId, statuses, RelatedEntityType.SUBJECT],
    );
  }

  private async queryObservationCountsBySemester(
    semesterId: string,
    statuses: ObservationStatus[],
    manager: EntityManager,
    requireSentNotification = false,
  ): Promise<{ subjectId: string; count: number }[]> {
    const notificationFilter = requireSentNotification
      ? `AND o."notificationStatus" = 'SENT'`
      : `AND (
          o.status != 'ABIERTA'
          OR o."notificationStatus" = 'SENT'
        )`;

    return manager.query(
      `SELECT s.id AS "subjectId", COUNT(DISTINCT o.id)::int AS count
       FROM subjects s
       INNER JOIN observations o ON (
         o."subjectId" = s.id
         OR (o."relatedEntityType" = $3 AND o."relatedEntityId" = s.id)
         OR o."topicId" IN (
           SELECT t.id FROM topics t
           WHERE t."subjectId" = s.id AND t."deletedAt" IS NULL
         )
         OR o."checklistItemId" IN (
           SELECT c.id FROM checklist_items c WHERE c."subjectId" = s.id
         )
       )
       WHERE s."semesterId" = $1
         AND s."deletedAt" IS NULL
         AND o.status = ANY($2)
         ${notificationFilter}
       GROUP BY s.id`,
      [semesterId, statuses, RelatedEntityType.SUBJECT],
    );
  }

  private async countObservationsForSubjectByStatuses(
    subjectId: string,
    statuses: ObservationStatus[],
    manager?: EntityManager,
  ): Promise<number> {
    const repo = manager ? manager.getRepository(ObservationEntity) : this.observationRepo;

    return repo
      .createQueryBuilder('o')
      .where('o.status IN (:...statuses)', { statuses })
      .andWhere(
        new Brackets((statusQb) => {
          statusQb
            .where('o.status != :abierta', { abierta: ObservationStatus.ABIERTA })
            .orWhere('o.notificationStatus = :sent', {
              sent: ObservationNotificationStatus.SENT,
            });
        }),
      )
      .andWhere(
        new Brackets((qb) => {
          qb.where('o.subjectId = :subjectId', { subjectId })
            .orWhere(
              '(o.relatedEntityType = :subjectType AND o.relatedEntityId = :subjectId)',
              { subjectType: RelatedEntityType.SUBJECT, subjectId },
            )
            .orWhere(
              `o.topicId IN (SELECT t.id FROM topics t WHERE t."subjectId" = :subjectId AND t."deletedAt" IS NULL)`,
              { subjectId },
            )
            .orWhere(
              `o.checklistItemId IN (SELECT c.id FROM checklist_items c WHERE c."subjectId" = :subjectId)`,
              { subjectId },
            );
        }),
      )
      .getCount();
  }

  async hasBlockingObservationsForProject(
    projectId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager ? manager.getRepository(ObservationEntity) : this.observationRepo;

    const count = await repo
      .createQueryBuilder('o')
      .where('o.projectId = :projectId', { projectId })
      .andWhere('o.status IN (:...blocking)', { blocking: BLOCKING_STATUSES })
      .andWhere('o.notificationStatus = :sent', { sent: ObservationNotificationStatus.SENT })
      .getCount();

    return count > 0;
  }

  async create(dto: CreateObservationDto, user: UserEntity): Promise<ObservationResponseDto> {
    if (
      user.role !== UserRole.PRODUCT &&
      user.role !== UserRole.FABRICA &&
      user.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException();
    }

    return await this.dataSource.transaction(async (manager) => {
      const project = await this.loadProjectForModify(dto.projectId, user, manager);
      await this.validateRelatedEntity(dto, manager);
      await this.assertNoProductObservationOnApprovedSubject(dto, user, manager);

      const notificationStatus =
        user.role === UserRole.PRODUCT
          ? ObservationNotificationStatus.PENDING
          : ObservationNotificationStatus.SENT;

      const observationRepo = manager.getRepository(ObservationEntity);
      const observation = await observationRepo.save(
        observationRepo.create({
          project: { id: dto.projectId },
          subject: dto.subjectId ? { id: dto.subjectId } : null,
          topic: dto.topicId ? { id: dto.topicId } : null,
          checklistItem: dto.checklistItemId ? { id: dto.checklistItemId } : null,
          author: { id: user.id },
          role: user.role,
          text: dto.text,
          status: ObservationStatus.ABIERTA,
          notificationStatus,
          sentAt: notificationStatus === ObservationNotificationStatus.SENT ? new Date() : null,
          sentBy:
            notificationStatus === ObservationNotificationStatus.SENT
              ? ({ id: user.id } as UserEntity)
              : null,
          relatedEntityType: dto.relatedEntityType,
          relatedEntityId: dto.relatedEntityId,
          priority: dto.priority,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        }),
      );

      await this.auditService.createLog(
        {
          entityType: 'OBSERVATION',
          entityId: observation.id,
          action: AuditAction.OBSERVATION_CREATE,
          userId: user.id,
          afterJson: {
            id: observation.id,
            projectId: dto.projectId,
            status: observation.status,
            relatedEntityType: dto.relatedEntityType,
            relatedEntityId: dto.relatedEntityId,
          },
        },
        manager,
      );

      if (user.role === UserRole.FABRICA) {
        await this.projectWorkflowService.updateProjectStatus(dto.projectId, user.id, manager);
      }

      if (user.role === UserRole.FABRICA && project.productOwner?.id) {
        await this.notificationsService.notifyUser(
          project.productOwner.id,
          {
            type: NotificationType.INFO,
            title: 'Observación de Fábrica',
            message: `Fábrica registró una observación en ${project.program}.`,
            entityType: 'OBSERVATION',
            entityId: observation.id,
            eventType: NotificationEventType.OBSERVATION_CREATED,
            projectId: project.id,
            subjectId: dto.subjectId ?? undefined,
            actionUrl: dto.subjectId
              ? `/subjects/${dto.subjectId}`
              : `/projects/${project.id}`,
          },
          manager,
        );
      }

      return this.findOneById(observation.id, user, manager);
    });
  }

  async findByProject(projectId: string, user: UserEntity): Promise<ObservationResponseDto[]> {
    await this.loadProjectForView(projectId, user);

    const qb = this.observationRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.author', 'author')
      .leftJoinAndSelect('o.resolvedBy', 'resolvedBy')
      .leftJoinAndSelect('o.messages', 'messages')
      .leftJoinAndSelect('messages.author', 'messageAuthor')
      .leftJoinAndSelect('o.checklistItem', 'checklistItem')
      .where('o.projectId = :projectId', { projectId });

    if (user.role === UserRole.FABRICA) {
      qb.andWhere(
        new Brackets((statusQb) => {
          statusQb
            .where('o.status != :abierta', { abierta: ObservationStatus.ABIERTA })
            .orWhere('o.notificationStatus = :sent', {
              sent: ObservationNotificationStatus.SENT,
            });
        }),
      );
    }

    const observations = await qb
      .orderBy('o.createdAt', 'DESC')
      .addOrderBy('messages.createdAt', 'ASC')
      .getMany();

    return observations.map((o) => {
      const dto = this.toObservationResponse(o);
      dto.projectId = projectId;
      return dto;
    });
  }

  async findBySubject(subjectId: string, user: UserEntity): Promise<ObservationResponseDto[]> {
    const subject = await this.subjectRepo.findOne({
      where: { id: subjectId, deletedAt: IsNull() },
      relations: { project: { productOwner: true, factoryOwner: true } },
    });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    this.projectsService.assertCanViewProject(subject.project, user);
    return await this.findBySubjectForProject(subjectId, subject.project.id, user);
  }

  async findBySubjectForProject(
    subjectId: string,
    projectId: string,
    user?: UserEntity,
  ): Promise<ObservationResponseDto[]> {
    const qb = this.observationRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.author', 'author')
      .leftJoinAndSelect('o.resolvedBy', 'resolvedBy')
      .leftJoinAndSelect('o.messages', 'messages')
      .leftJoinAndSelect('messages.author', 'messageAuthor')
      .leftJoinAndSelect('o.checklistItem', 'checklistItem')
      .leftJoin('o.topic', 'topic')
      .leftJoin('checklistItem.subject', 'checklistSubject')
      .where(
        new Brackets((sub) => {
          sub
            .where('o.subjectId = :subjectId', { subjectId })
            .orWhere(
              '(o.relatedEntityType = :subjectType AND o.relatedEntityId = :subjectId)',
              { subjectType: RelatedEntityType.SUBJECT, subjectId },
            )
            .orWhere('topic.subjectId = :subjectId', { subjectId })
            .orWhere('checklistSubject.id = :subjectId', { subjectId });
        }),
      )
      .andWhere(
        new Brackets((sub) => {
          sub.where('o.projectId = :projectId', { projectId }).orWhere('o.projectId IS NULL');
        }),
      );

    if (user?.role === UserRole.FABRICA) {
      qb.andWhere('o.notificationStatus = :sent', { sent: ObservationNotificationStatus.SENT });
    }

    const observations = await qb
      .orderBy('o.createdAt', 'DESC')
      .addOrderBy('messages.createdAt', 'ASC')
      .getMany();

    return observations.map((o) => {
      const dto = this.toObservationResponse(o);
      dto.projectId = projectId;
      return dto;
    });
  }

  async addMessage(
    observationId: string,
    dto: CreateObservationMessageDto,
    user: UserEntity,
  ): Promise<ObservationMessageResponseDto> {
    const full = await this.dataSource.transaction(async (manager) => {
      const observationRepo = manager.getRepository(ObservationEntity);
      const messageRepo = manager.getRepository(ObservationMessageEntity);
      const observation = await observationRepo.findOne({
        where: { id: observationId },
        relations: {
          project: { productOwner: true, factoryOwner: true },
          subject: true,
        },
      });
      if (!observation) {
        throw new NotFoundException('Observation not found');
      }
      this.projectsService.assertCanViewProject(observation.project, user);

      const message = await messageRepo.save(
        messageRepo.create({
          observation: { id: observation.id },
          author: { id: user.id },
          message: dto.message,
        }),
      );

      if (this.shouldAutoResolveReducedFactoryCorrection(observation, user)) {
        const previousStatus = observation.status;
        observation.status = ObservationStatus.RESUELTA;
        observation.resolvedBy = { id: user.id } as UserEntity;
        observation.resolvedAt = new Date();
        observation.correctionNotificationStatus = ObservationNotificationStatus.SENT;
        await observationRepo.save(observation);

        await this.statusHistoryService.recordIfChanged(
          {
            entityType: 'OBSERVATION',
            entityId: observation.id,
            fromStatus: previousStatus,
            toStatus: ObservationStatus.RESUELTA,
            changedById: user.id,
          },
          manager,
        );

        await this.auditService.createLog(
          {
            entityType: 'OBSERVATION',
            entityId: observation.id,
            action: AuditAction.OBSERVATION_STATUS_CHANGE,
            userId: user.id,
            beforeJson: { status: previousStatus },
            afterJson: {
              status: ObservationStatus.RESUELTA,
              autoResolvedInReducedFlow: true,
            },
          },
          manager,
        );

        await this.recalculateAfterObservationChange(observation, user.id, manager);
      }

      return await messageRepo.findOne({
        where: { id: message.id },
        relations: { author: true },
      });
    });

    return {
      id: full!.id,
      author: this.toOwner(full!.author),
      message: full!.message,
      createdAt: full!.createdAt,
    };
  }

  async markCorrectionApplied(
    observationId: string,
    user: UserEntity,
  ): Promise<UpdateObservationStatusResponseDto> {
    if (user.role !== UserRole.FABRICA && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }

    return await this.dataSource.transaction(async (manager) => {
      const observation = await this.markCorrectionAppliedInTransaction(
        observationId,
        user,
        manager,
      );
      const full = await this.findOneById(observation.id, user, manager);
      return {
        observation: full,
        previousStatus: ObservationStatus.ABIERTA,
        currentStatus: ObservationStatus.EN_CORRECCION,
        projectId: observation.project.id,
        subjectId: observation.subjectId ?? undefined,
      };
    });
  }

  async markCorrectionAppliedInTransaction(
    observationId: string,
    user: UserEntity,
    manager: EntityManager,
  ): Promise<ObservationEntity> {
    const observationRepo = manager.getRepository(ObservationEntity);
    const observation = await observationRepo.findOne({
      where: { id: observationId },
      relations: {
        project: { productOwner: true, factoryOwner: true },
        subject: { semester: true },
      },
    });

    if (!observation) {
      throw new NotFoundException('Observation not found');
    }

    this.projectsService.assertCanModifyProject(observation.project, user);

    if (observation.status !== ObservationStatus.ABIERTA) {
      throw new BadRequestException(
        `Observation must be in status ${ObservationStatus.ABIERTA} to perform this action`,
      );
    }

    const previousStatus = observation.status;
    observation.status = ObservationStatus.EN_CORRECCION;
    observation.correctionNotificationStatus = ObservationNotificationStatus.PENDING;
    await observationRepo.save(observation);

    await this.statusHistoryService.recordIfChanged(
      {
        entityType: 'OBSERVATION',
        entityId: observation.id,
        fromStatus: previousStatus,
        toStatus: ObservationStatus.EN_CORRECCION,
        changedById: user.id,
      },
      manager,
    );

    await this.auditService.createLog(
      {
        entityType: 'OBSERVATION',
        entityId: observation.id,
        action: AuditAction.OBSERVATION_STATUS_CHANGE,
        userId: user.id,
        beforeJson: { status: previousStatus },
        afterJson: { status: ObservationStatus.EN_CORRECCION },
      },
      manager,
    );

    await this.recalculateAfterObservationChange(observation, user.id, manager);
    return observation;
  }

  async validate(
    observationId: string,
    user: UserEntity,
  ): Promise<UpdateObservationStatusResponseDto> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }

    return await this.transitionObservation(
      observationId,
      user,
      ObservationStatus.EN_CORRECCION,
      ObservationStatus.RESUELTA,
      true,
    );
  }

  async deleteDraft(observationId: string, user: UserEntity): Promise<void> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }

    await this.dataSource.transaction(async (manager) => {
      const observationRepo = manager.getRepository(ObservationEntity);
      const observation = await observationRepo.findOne({
        where: { id: observationId },
        relations: {
          project: { productOwner: true, factoryOwner: true },
          subject: { semester: true },
          checklistItem: true,
        },
      });

      if (!observation) {
        throw new NotFoundException('Observation not found');
      }

      this.projectsService.assertCanModifyProject(observation.project, user);

      if (
        observation.status !== ObservationStatus.ABIERTA ||
        observation.notificationStatus !== ObservationNotificationStatus.PENDING
      ) {
        throw new BadRequestException(
          'Solo puedes eliminar borradores que aún no se enviaron a Fábrica.',
        );
      }

      if (observation.role !== UserRole.PRODUCT) {
        throw new BadRequestException('Solo se pueden eliminar observaciones creadas por Product.');
      }

      const checklistItemId = this.resolveChecklistItemIdFromObservation(observation);
      const subjectId = observation.subject?.id ?? observation.subjectId ?? null;
      const projectId = observation.project.id;

      await this.auditService.createLog(
        {
          entityType: 'OBSERVATION',
          entityId: observation.id,
          action: AuditAction.DELETE,
          userId: user.id,
          beforeJson: {
            status: observation.status,
            notificationStatus: observation.notificationStatus,
            text: observation.text,
            checklistItemId,
          },
        },
        manager,
      );

      await observationRepo.remove(observation);

      if (checklistItemId) {
        const remainingCount = await this.countLinkedObservationsForChecklistItem(
          checklistItemId,
          manager,
        );
        if (remainingCount === 0) {
          const checklistRepo = manager.getRepository(ChecklistItemEntity);
          const item = await checklistRepo.findOne({ where: { id: checklistItemId } });
          if (item?.status === ChecklistStatus.RECHAZADO) {
            const previousStatus = item.status;
            item.status = ChecklistStatus.PENDIENTE;
            item.updatedBy = { id: user.id } as UserEntity;
            await checklistRepo.save(item);
            await this.auditService.createLog(
              {
                entityType: RelatedEntityType.CHECKLIST_ITEM,
                entityId: item.id,
                action: AuditAction.CHECKLIST_UPDATE,
                userId: user.id,
                beforeJson: { status: previousStatus },
                afterJson: { status: ChecklistStatus.PENDIENTE, source: 'OBSERVATION_DRAFT_DELETED' },
              },
              manager,
            );
          }
        }
      }

      if (subjectId) {
        const subjectRepo = manager.getRepository(SubjectEntity);
        const subject = await subjectRepo.findOne({ where: { id: subjectId } });
        if (subject) {
          await this.recalculateAfterObservationChange(
            { ...observation, subject, subjectId } as ObservationEntity,
            user.id,
            manager,
          );
        }
      } else {
        await this.projectWorkflowService.updateProjectStatus(projectId, user.id, manager);
      }
    });
  }

  private async countLinkedObservationsForChecklistItem(
    checklistItemId: string,
    manager: EntityManager,
  ): Promise<number> {
    const observationRepo = manager.getRepository(ObservationEntity);
    return observationRepo
      .createQueryBuilder('o')
      .where('o.checklistItemId = :itemId', { itemId: checklistItemId })
      .orWhere(
        '(o.relatedEntityType = :checklistType AND o.relatedEntityId = :itemId)',
        { checklistType: RelatedEntityType.CHECKLIST_ITEM, itemId: checklistItemId },
      )
      .getCount();
  }

  async reopen(
    observationId: string,
    reason: string,
    user: UserEntity,
  ): Promise<UpdateObservationStatusResponseDto> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }

    return await this.dataSource.transaction(async (manager) => {
      const observationRepo = manager.getRepository(ObservationEntity);
      const observation = await observationRepo.findOne({
        where: { id: observationId },
        relations: {
          project: { productOwner: true, factoryOwner: true },
          subject: { semester: true },
        },
      });

      if (!observation) {
        throw new NotFoundException('Observation not found');
      }

      this.projectsService.assertCanModifyProject(observation.project, user);

      if (observation.status !== ObservationStatus.EN_CORRECCION &&
          observation.status !== ObservationStatus.RESUELTA) {
        throw new BadRequestException(
          'Observation must be in status EN_CORRECCION or RESUELTA to reopen it',
        );
      }

      const previousStatus = observation.status;
      observation.status = ObservationStatus.ABIERTA;
      observation.text = reason.trim();
      observation.resolvedAt = null;
      observation.resolvedBy = null;
      observation.notificationStatus = ObservationNotificationStatus.PENDING;
      observation.correctionNotificationStatus = null;
      observation.sentAt = null;
      observation.sentBy = null;
      await observationRepo.save(observation);

      await this.statusHistoryService.recordIfChanged(
        {
          entityType: 'OBSERVATION',
          entityId: observation.id,
          fromStatus: previousStatus,
          toStatus: ObservationStatus.ABIERTA,
          changedById: user.id,
        },
        manager,
      );

      await this.auditService.createLog(
        {
          entityType: 'OBSERVATION',
          entityId: observation.id,
          action: AuditAction.OBSERVATION_STATUS_CHANGE,
          userId: user.id,
          beforeJson: { status: previousStatus },
          afterJson: { status: ObservationStatus.ABIERTA, text: observation.text, reopened: true },
        },
        manager,
      );

      const workflow = await this.recalculateAfterObservationChange(observation, user.id, manager);
      const full = await this.findOneById(observation.id, user, manager);

      return {
        observation: full,
        previousStatus,
        currentStatus: ObservationStatus.ABIERTA,
        ...workflow,
      };
    });
  }

  private async transitionObservation(
    observationId: string,
    user: UserEntity,
    expectedStatus: ObservationStatus,
    nextStatus: ObservationStatus,
    setResolved: boolean,
  ): Promise<UpdateObservationStatusResponseDto> {
    return await this.dataSource.transaction(async (manager) => {
      const observationRepo = manager.getRepository(ObservationEntity);
      const observation = await observationRepo.findOne({
        where: { id: observationId },
        relations: {
          project: { productOwner: true, factoryOwner: true },
          subject: { semester: true },
        },
      });

      if (!observation) {
        throw new NotFoundException('Observation not found');
      }

      this.projectsService.assertCanModifyProject(observation.project, user);

      if (observation.status !== expectedStatus) {
        throw new BadRequestException(
          `Observation must be in status ${expectedStatus} to perform this action`,
        );
      }

      const previousStatus = observation.status;
      observation.status = nextStatus;
      if (setResolved) {
        observation.resolvedBy = { id: user.id } as UserEntity;
        observation.resolvedAt = new Date();
      }
      if (nextStatus === ObservationStatus.EN_CORRECCION) {
        observation.correctionNotificationStatus = ObservationNotificationStatus.PENDING;
      }
      await observationRepo.save(observation);

      await this.statusHistoryService.recordIfChanged(
        {
          entityType: 'OBSERVATION',
          entityId: observation.id,
          fromStatus: previousStatus,
          toStatus: nextStatus,
          changedById: user.id,
        },
        manager,
      );

      await this.auditService.createLog(
        {
          entityType: 'OBSERVATION',
          entityId: observation.id,
          action: AuditAction.OBSERVATION_STATUS_CHANGE,
          userId: user.id,
          beforeJson: { status: previousStatus },
          afterJson: { status: nextStatus },
        },
        manager,
      );

      if (nextStatus === ObservationStatus.RESUELTA) {
        await this.approveLinkedChecklistItemAfterValidation(observation, user, manager);
        const subjectId =
          observation.subject?.id ??
          observation.subjectId ??
          (await this.resolveSubjectIdFromObservation(observation, manager));
        if (subjectId) {
          await this.repairChecklistItemsWithResolvedObservationCycles(subjectId, user, manager);
        }
        await this.notificationsService.notifyFactoryOwner(
          observation.project.factoryOwner?.id,
          {
            type: NotificationType.INFO,
            title: 'Observación validada',
            message: 'Producto validó una observación como resuelta.',
            entityType: 'OBSERVATION',
            entityId: observation.id,
            eventType: NotificationEventType.OBSERVATION_VALIDATED,
            projectId: observation.project.id,
            subjectId: observation.subjectId ?? undefined,
            actionUrl: observation.subjectId
              ? `/subjects/${observation.subjectId}`
              : `/projects/${observation.project.id}`,
          },
          manager,
        );
      }

      const workflow = await this.recalculateAfterObservationChange(observation, user.id, manager);
      const full = await this.findOneById(observation.id, user, manager);

      return {
        observation: full,
        previousStatus,
        currentStatus: nextStatus,
        ...workflow,
      };
    });
  }

  private resolveChecklistItemIdFromObservation(
    observation: Pick<
      ObservationEntity,
      'checklistItem' | 'checklistItemId' | 'relatedEntityType' | 'relatedEntityId'
    >,
  ): string | null {
    return (
      observation.checklistItem?.id ??
      observation.checklistItemId ??
      (observation.relatedEntityType === RelatedEntityType.CHECKLIST_ITEM
        ? observation.relatedEntityId
        : null)
    );
  }

  private async approveLinkedChecklistItemAfterValidation(
    observation: ObservationEntity,
    user: UserEntity,
    manager: EntityManager,
  ): Promise<void> {
    const checklistItemId = this.resolveChecklistItemIdFromObservation(observation);
    if (!checklistItemId) return;

    await this.approveChecklistItemById(checklistItemId, user, manager, 'OBSERVATION_VALIDATED');
  }

  /** Aprueba ítems PRODUCT cuyo ciclo de observaciones visible quedó 100% RESUELTA. */
  async repairChecklistItemsWithResolvedObservationCycles(
    subjectId: string,
    user: UserEntity,
    manager: EntityManager,
  ): Promise<void> {
    const checklistRepo = manager.getRepository(ChecklistItemEntity);
    const observationRepo = manager.getRepository(ObservationEntity);

    const productItems = await checklistRepo.find({
      where: { subject: { id: subjectId }, ownerRole: UserRole.PRODUCT },
    });

    for (const item of productItems) {
      if (item.status === ChecklistStatus.APROBADO) continue;

      const linkedObservations = await observationRepo
        .createQueryBuilder('o')
        .where('o.checklistItemId = :itemId', { itemId: item.id })
        .orWhere(
          '(o.relatedEntityType = :checklistType AND o.relatedEntityId = :itemId)',
          { checklistType: RelatedEntityType.CHECKLIST_ITEM, itemId: item.id },
        )
        .getMany();

      const visible = linkedObservations.filter(
        (obs) =>
          !(
            obs.status === ObservationStatus.ABIERTA &&
            obs.notificationStatus === ObservationNotificationStatus.PENDING
          ),
      );

      if (visible.length === 0) continue;

      const allResolved = visible.every((obs) => obs.status === ObservationStatus.RESUELTA);
      if (!allResolved) continue;

      await this.approveChecklistItemById(
        item.id,
        user,
        manager,
        'OBSERVATION_CYCLE_RESOLVED',
      );
    }
  }

  private async approveChecklistItemById(
    checklistItemId: string,
    user: UserEntity,
    manager: EntityManager,
    source: string,
  ): Promise<void> {
    const checklistRepo = manager.getRepository(ChecklistItemEntity);
    const item = await checklistRepo.findOne({ where: { id: checklistItemId } });
    if (!item || item.status === ChecklistStatus.APROBADO) return;

    const previousStatus = item.status;
    item.status = ChecklistStatus.APROBADO;
    item.updatedBy = { id: user.id } as UserEntity;
    await checklistRepo.save(item);

    await this.auditService.createLog(
      {
        entityType: RelatedEntityType.CHECKLIST_ITEM,
        entityId: item.id,
        action: AuditAction.CHECKLIST_UPDATE,
        userId: user.id,
        beforeJson: { status: previousStatus },
        afterJson: { status: ChecklistStatus.APROBADO, source },
      },
      manager,
    );
  }

  private async recalculateAfterObservationChange(
    observation: ObservationEntity,
    userId: string,
    manager: EntityManager,
  ): Promise<Partial<UpdateObservationStatusResponseDto>> {
    const subjectId =
      observation.subject?.id ??
      (await this.resolveSubjectIdFromObservation(observation, manager));

    if (!subjectId) {
      const projectStatus = await this.projectWorkflowService.updateProjectStatus(
        observation.project.id,
        userId,
        manager,
        observation.project.status,
      );
      const projectProgress = await this.progressService.calculateProjectProgress(
        observation.project.id,
        manager,
      );
      return {
        projectId: observation.project.id,
        projectStatus,
        projectProgress,
      };
    }

    await this.progressService.calculateSubjectProgress(subjectId, manager);
    const subjectWithSemester = await manager.getRepository(SubjectEntity).findOne({
      where: { id: subjectId },
      relations: { semester: true, project: true },
    });
    if (!subjectWithSemester) {
      throw new Error(`Subject ${subjectId} not found`);
    }

    await this.subjectWorkflowService.updateSubjectStatus(
      subjectId,
      userId,
      manager,
      subjectWithSemester.status,
    );
    const semesterStatus = await this.semesterWorkflowService.updateSemesterStatus(
      subjectWithSemester.semester.id,
      userId,
      manager,
      subjectWithSemester.semester.status,
    );
    const projectStatus = await this.projectWorkflowService.updateProjectStatus(
      observation.project.id,
      userId,
      manager,
      subjectWithSemester.project.status,
    );
    const projectProgress = await this.progressService.calculateProjectProgress(
      observation.project.id,
      manager,
    );
    const refreshedSubject = await manager.getRepository(SubjectEntity).findOne({
      where: { id: subjectId },
      select: { id: true, status: true, progress: true },
    });

    return {
      subjectId,
      subjectStatus: refreshedSubject!.status,
      subjectProgress: refreshedSubject!.progress,
      semesterId: subjectWithSemester.semester.id,
      semesterStatus,
      projectId: observation.project.id,
      projectStatus,
      projectProgress,
    };
  }

  private async resolveSubjectIdFromObservation(
    observation: ObservationEntity,
    manager: EntityManager,
  ): Promise<string | null> {
    if (observation.subject) return observation.subject.id;

    const checklistRepo = manager.getRepository(ChecklistItemEntity);
    const topicRepo = manager.getRepository(TopicEntity);
    const subjectRepo = manager.getRepository(SubjectEntity);

    if (observation.checklistItem) {
      const item = await checklistRepo.findOne({
        where: { id: observation.checklistItem.id },
        relations: { subject: true },
      });
      return item?.subject?.id ?? null;
    }

    if (observation.topic) {
      const topic = await topicRepo.findOne({
        where: { id: observation.topic.id },
        relations: { subject: true },
      });
      return topic?.subject?.id ?? null;
    }

    if (observation.relatedEntityType === RelatedEntityType.SUBJECT) {
      return observation.relatedEntityId;
    }
    if (observation.relatedEntityType === RelatedEntityType.TOPIC) {
      const topic = await topicRepo.findOne({
        where: { id: observation.relatedEntityId },
        relations: { subject: true },
      });
      return topic?.subject?.id ?? null;
    }
    if (observation.relatedEntityType === RelatedEntityType.CHECKLIST_ITEM) {
      const item = await checklistRepo.findOne({
        where: { id: observation.relatedEntityId },
        relations: { subject: true },
      });
      return item?.subject?.id ?? null;
    }

    return null;
  }

  private async findOneById(
    id: string,
    user: UserEntity,
    manager?: EntityManager,
  ): Promise<ObservationResponseDto> {
    const repo = manager ? manager.getRepository(ObservationEntity) : this.observationRepo;
    const observation = await repo.findOne({
      where: { id },
      relations: {
        author: true,
        resolvedBy: true,
        messages: { author: true },
        checklistItem: true,
        project: { productOwner: true, factoryOwner: true },
      },
    });
    if (!observation) {
      throw new NotFoundException('Observation not found');
    }
    if (!manager) {
      this.projectsService.assertCanViewProject(observation.project, user);
    }
    return this.toObservationResponse(observation);
  }

  private async loadObservationWithAccess(
    observationId: string,
    user: UserEntity,
  ): Promise<ObservationEntity> {
    const observation = await this.observationRepo.findOne({
      where: { id: observationId },
      relations: {
        project: { productOwner: true, factoryOwner: true },
      },
    });
    if (!observation) {
      throw new NotFoundException('Observation not found');
    }
    this.projectsService.assertCanViewProject(observation.project, user);
    return observation;
  }

  private shouldAutoResolveReducedFactoryCorrection(
    observation: ObservationEntity,
    user: UserEntity,
  ): boolean {
    if (!isReducedInstitutionalFlow()) {
      return false;
    }

    if (user.role !== UserRole.PRODUCT || observation.role !== UserRole.FABRICA) {
      return false;
    }

    if (observation.status !== ObservationStatus.ABIERTA) {
      return false;
    }

    const operationalState = observation.subject?.operationalState;
    return [
      InstitutionalOperationalState.PENDING_FACTORY,
      InstitutionalOperationalState.IN_FACTORY_PRODUCTION,
      InstitutionalOperationalState.CHANGES_REQUESTED_BY_PRODUCT,
    ].includes(operationalState as InstitutionalOperationalState);
  }

  private async loadProjectForView(
    projectId: string,
    user: UserEntity,
  ): Promise<ProjectEntity> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId, deletedAt: IsNull() },
      relations: { productOwner: true, factoryOwner: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    this.projectsService.assertCanViewProject(project, user);
    return project;
  }

  private async loadProjectForModify(
    projectId: string,
    user: UserEntity,
    manager?: EntityManager,
  ): Promise<ProjectEntity> {
    const repo = manager ? manager.getRepository(ProjectEntity) : this.projectRepo;
    const project = await repo.findOne({
      where: { id: projectId, deletedAt: IsNull() },
      relations: { productOwner: true, factoryOwner: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    this.projectsService.assertCanModifyProject(project, user);
    return project;
  }

  private async validateRelatedEntity(
    dto: CreateObservationDto,
    manager: EntityManager,
  ): Promise<void> {
    const projectRepo = manager.getRepository(ProjectEntity);
    const subjectRepo = manager.getRepository(SubjectEntity);
    const topicRepo = manager.getRepository(TopicEntity);
    const checklistRepo = manager.getRepository(ChecklistItemEntity);
    const semesterRepo = manager.getRepository(SemesterEntity);

    const project = await projectRepo.findOne({ where: { id: dto.projectId } });
    if (!project) {
      throw new BadRequestException('Project not found');
    }

    const assertBelongsToProject = async () => {
      if (dto.subjectId) {
        const subject = await subjectRepo.findOne({
          where: { id: dto.subjectId, project: { id: dto.projectId } },
        });
        if (!subject) {
          throw new BadRequestException('subjectId does not belong to project');
        }
      }
      if (dto.topicId) {
        const topic = await topicRepo.findOne({
          where: { id: dto.topicId, subject: { project: { id: dto.projectId } } },
          relations: { subject: true },
        });
        if (!topic) {
          throw new BadRequestException('topicId does not belong to project');
        }
        if (dto.subjectId && topic.subject.id !== dto.subjectId) {
          throw new BadRequestException('topicId does not belong to subject');
        }
      }
      if (dto.checklistItemId) {
        const item = await checklistRepo.findOne({
          where: { id: dto.checklistItemId, subject: { project: { id: dto.projectId } } },
          relations: { subject: true, topic: true },
        });
        if (!item) {
          throw new BadRequestException('checklistItemId does not belong to project');
        }
        if (dto.subjectId && item.subject.id !== dto.subjectId) {
          throw new BadRequestException('checklistItemId does not belong to subject');
        }
        if (dto.topicId && item.topic?.id !== dto.topicId) {
          throw new BadRequestException('checklistItemId does not belong to topic');
        }
      }
    };

    await assertBelongsToProject();

    switch (dto.relatedEntityType) {
      case RelatedEntityType.PROJECT:
        if (dto.relatedEntityId !== dto.projectId) {
          throw new BadRequestException('relatedEntityId must match projectId for PROJECT type');
        }
        break;
      case RelatedEntityType.SEMESTER: {
        const semester = await semesterRepo.findOne({
          where: { id: dto.relatedEntityId, project: { id: dto.projectId } },
        });
        if (!semester) {
          throw new BadRequestException('relatedEntityId semester not found in project');
        }
        break;
      }
      case RelatedEntityType.SUBJECT: {
        const subject = await subjectRepo.findOne({
          where: { id: dto.relatedEntityId, project: { id: dto.projectId } },
        });
        if (!subject) {
          throw new BadRequestException('relatedEntityId subject not found in project');
        }
        break;
      }
      case RelatedEntityType.TOPIC: {
        const topic = await topicRepo.findOne({
          where: { id: dto.relatedEntityId, subject: { project: { id: dto.projectId } } },
        });
        if (!topic) {
          throw new BadRequestException('relatedEntityId topic not found in project');
        }
        break;
      }
      case RelatedEntityType.CHECKLIST_ITEM: {
        const item = await checklistRepo.findOne({
          where: { id: dto.relatedEntityId, subject: { project: { id: dto.projectId } } },
        });
        if (!item) {
          throw new BadRequestException('relatedEntityId checklist item not found in project');
        }
        break;
      }
      default:
        throw new BadRequestException('Invalid relatedEntityType');
    }
  }

  private async assertNoProductObservationOnApprovedSubject(
    dto: CreateObservationDto,
    user: UserEntity,
    manager: EntityManager,
  ): Promise<void> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) return;

    const subjectId =
      dto.subjectId ??
      (dto.relatedEntityType === RelatedEntityType.SUBJECT ? dto.relatedEntityId : null);
    if (!subjectId) return;

    const subject = await manager.getRepository(SubjectEntity).findOne({
      where: { id: subjectId, deletedAt: IsNull() },
    });
    if (
      subject?.status === SubjectStatus.APPROVED ||
      subject?.status === SubjectStatus.DELIVERED
    ) {
      throw new BadRequestException('Approved subjects cannot receive new correction observations.');
    }
  }

  toOwner(user: UserEntity): ProjectOwnerDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }

  toObservationResponse(observation: ObservationEntity): ObservationResponseDto {
    return {
      id: observation.id,
      projectId: observation.project?.id ?? observation.projectId,
      subjectId: observation.subject?.id ?? observation.subjectId ?? null,
      topicId: observation.topic?.id ?? observation.topicId ?? null,
      checklistItemId: observation.checklistItem?.id ?? observation.checklistItemId ?? null,
      author: this.toOwner(observation.author),
      role: observation.role,
      text: observation.text,
      status: observation.status,
      notificationStatus: observation.notificationStatus,
      correctionNotificationStatus: observation.correctionNotificationStatus,
      relatedEntityType: observation.relatedEntityType,
      relatedEntityId: observation.relatedEntityId,
      priority: observation.priority,
      dueDate: observation.dueDate,
      resolvedBy: observation.resolvedBy ? this.toOwner(observation.resolvedBy) : null,
      resolvedAt: observation.resolvedAt,
      checklistItem: observation.checklistItem
        ? { id: observation.checklistItem.id, label: observation.checklistItem.label }
        : null,
      messages: (observation.messages ?? []).map((m) => ({
        id: m.id,
        author: this.toOwner(m.author),
        message: m.message,
        createdAt: m.createdAt,
      })),
      createdAt: observation.createdAt,
      updatedAt: observation.updatedAt,
    };
  }
}
