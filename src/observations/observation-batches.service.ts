import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { NotificationEventType } from '../common/enums/notification-event-type.enum';
import { NotificationType } from '../common/enums/notification-type.enum';
import { ObservationBatchType } from '../common/enums/observation-batch-type.enum';
import { ObservationBatchScope } from '../common/enums/observation-batch-scope.enum';
import { ObservationNotificationStatus } from '../common/enums/observation-notification-status.enum';
import { ObservationStatus } from '../common/enums/observation-status.enum';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { AuditService } from '../audit/audit.service';
import { StatusHistoryService } from '../audit/status-history.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectEntity } from '../projects/project.entity';
import { ProjectsService } from '../projects/projects.service';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { UserEntity } from '../users/user.entity';
import { ObservationBatchResponseDto } from './dto/observation-batch-response.dto';
import { ObservationBatchEntity } from './observation-batch.entity';
import { ObservationEntity } from './observation.entity';
import { ObservationsService } from './observations.service';

@Injectable()
export class ObservationBatchesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
    @Inject(forwardRef(() => ObservationsService))
    private readonly observationsService: ObservationsService,
    private readonly auditService: AuditService,
    private readonly statusHistoryService: StatusHistoryService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  async sendObservationsToFactory(
    subjectId: string,
    user: UserEntity,
  ): Promise<ObservationBatchResponseDto> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }

    return await this.dataSource.transaction(async (manager) => {
      const subject = await this.loadSubject(subjectId, manager);
      this.projectsService.assertCanManageAsProductOwner(subject.project, user);

      const observationRepo = manager.getRepository(ObservationEntity);
      const pending = await observationRepo.find({
        where: {
          subject: { id: subjectId },
          role: UserRole.PRODUCT,
          status: ObservationStatus.ABIERTA,
          notificationStatus: ObservationNotificationStatus.PENDING,
        },
        relations: { checklistItem: true, topic: true },
        order: { createdAt: 'ASC' },
      });

      if (pending.length === 0) {
        throw new BadRequestException('No hay observaciones pendientes de envío a Fábrica.');
      }

      const now = new Date();
      const batchRepo = manager.getRepository(ObservationBatchEntity);
      const batch = await batchRepo.save(
        batchRepo.create({
          project: { id: subject.project.id },
          subject: { id: subjectId },
          semester: { id: subject.semester.id },
          semesterId: subject.semester.id,
          scope: ObservationBatchScope.SUBJECT,
          type: ObservationBatchType.PRODUCT_OBSERVATIONS,
          senderRole: UserRole.PRODUCT,
          receiverRole: UserRole.FABRICA,
          sentAt: now,
          sentBy: { id: user.id },
          metadata: {
            observationIds: pending.map((o) => o.id),
          },
        }),
      );

      for (const observation of pending) {
        observation.notificationStatus = ObservationNotificationStatus.SENT;
        observation.notificationBatch = batch;
        observation.sentAt = now;
        observation.sentBy = { id: user.id } as UserEntity;
        await observationRepo.save(observation);
      }

      const projectRepo = manager.getRepository(ProjectEntity);
      const previousStatus = subject.project.status;
      if (previousStatus !== ProjectStatus.FEEDBACK_PENDING) {
        await projectRepo.update({ id: subject.project.id }, { status: ProjectStatus.FEEDBACK_PENDING });
        await this.statusHistoryService.recordIfChanged(
          {
            entityType: 'PROJECT',
            entityId: subject.project.id,
            fromStatus: previousStatus,
            toStatus: ProjectStatus.FEEDBACK_PENDING,
            changedById: user.id,
          },
          manager,
        );
      }

      await this.notificationsService.notifyFactoryOwner(
        subject.project.factoryOwner?.id,
        {
          type: NotificationType.ACTION,
          title: 'Observaciones de Product',
          message: `Product envió ${pending.length} observación(es) en ${subject.name}.`,
          entityType: 'OBSERVATION_BATCH',
          entityId: batch.id,
          eventType: NotificationEventType.OBSERVATION_BATCH_SENT,
          projectId: subject.project.id,
          subjectId,
          actionUrl: `/subjects/${subjectId}?focus=correction`,
          severity: 'attention',
        },
        manager,
      );

      await this.mailService.sendProductObservationsBatchEmail({
        subject,
        observations: pending,
        batchId: batch.id,
      });

      await this.auditService.createLog(
        {
          entityType: 'OBSERVATION_BATCH',
          entityId: batch.id,
          action: AuditAction.CREATE,
          userId: user.id,
          afterJson: {
            type: batch.type,
            subjectId,
            observationCount: pending.length,
          },
        },
        manager,
      );

      return {
        id: batch.id,
        subjectId,
        projectId: subject.project.id,
        type: batch.type,
        observationCount: pending.length,
        sentAt: batch.sentAt,
      };
    });
  }

  async notifyCorrectionsToProduct(
    subjectId: string,
    user: UserEntity,
    observationIds?: string[],
  ): Promise<ObservationBatchResponseDto> {
    if (user.role !== UserRole.FABRICA && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }

    return await this.dataSource.transaction(async (manager) => {
      const subject = await this.loadSubject(subjectId, manager);
      this.projectsService.assertCanModifyProject(subject.project, user);

      const observationRepo = manager.getRepository(ObservationEntity);
      if (!observationIds?.length) {
        throw new BadRequestException('Selecciona al menos una corrección para enviar a Product.');
      }

      const idSet = new Set(observationIds);
      const subjectObservations = await observationRepo.find({
        where: { subject: { id: subjectId } },
        relations: {
          checklistItem: true,
          topic: true,
          project: { productOwner: true, factoryOwner: true },
          subject: { semester: true },
        },
        order: { updatedAt: 'ASC' },
      });
      const selectedObservations = subjectObservations.filter((observation) => idSet.has(observation.id));

      if (selectedObservations.length !== observationIds.length) {
        throw new BadRequestException(
          'Algunas correcciones seleccionadas no existen en esta asignatura.',
        );
      }

      const toNotify: ObservationEntity[] = [];

      for (const observation of selectedObservations) {
        if (
          observation.status === ObservationStatus.ABIERTA &&
          observation.notificationStatus === ObservationNotificationStatus.SENT
        ) {
          const marked = await this.observationsService.markCorrectionAppliedInTransaction(
            observation.id,
            user,
            manager,
          );
          toNotify.push(marked);
          continue;
        }

        if (
          observation.status === ObservationStatus.EN_CORRECCION &&
          observation.correctionNotificationStatus === ObservationNotificationStatus.PENDING
        ) {
          toNotify.push(observation);
          continue;
        }

        if (
          observation.status === ObservationStatus.EN_CORRECCION &&
          observation.correctionNotificationStatus === ObservationNotificationStatus.SENT
        ) {
          throw new BadRequestException('Una corrección seleccionada ya fue notificada a Product.');
        }

        throw new BadRequestException(
          'Algunas correcciones seleccionadas no están listas para enviar a Product.',
        );
      }

      if (toNotify.length === 0) {
        throw new BadRequestException('No hay correcciones listas para notificar a Product.');
      }

      const now = new Date();
      const batchRepo = manager.getRepository(ObservationBatchEntity);
      const batch = await batchRepo.save(
        batchRepo.create({
          project: { id: subject.project.id },
          subject: { id: subjectId },
          semester: { id: subject.semester.id },
          semesterId: subject.semester.id,
          scope: ObservationBatchScope.SUBJECT,
          type: ObservationBatchType.FACTORY_CORRECTIONS,
          senderRole: UserRole.FABRICA,
          receiverRole: UserRole.PRODUCT,
          sentAt: now,
          sentBy: { id: user.id },
          metadata: {
            observationIds: toNotify.map((o) => o.id),
          },
        }),
      );

      for (const observation of toNotify) {
        observation.correctionNotificationStatus = ObservationNotificationStatus.SENT;
        await observationRepo.save(observation);
      }

      if (subject.project.productOwner?.id) {
        await this.notificationsService.notifyUser(
          subject.project.productOwner.id,
          {
            type: NotificationType.ACTION,
            title: 'Correcciones de Fábrica',
            message: `Fábrica notificó ${toNotify.length} corrección(es) en ${subject.name}.`,
            entityType: 'OBSERVATION_BATCH',
            entityId: batch.id,
            eventType: NotificationEventType.CORRECTION_BATCH_NOTIFIED,
            projectId: subject.project.id,
            subjectId,
            actionUrl: `/subjects/${subjectId}`,
            severity: 'attention',
          },
          manager,
        );
      }

      await this.mailService.sendFactoryCorrectionsBatchEmail({
        subject,
        observations: toNotify,
        batchId: batch.id,
      });

      await this.auditService.createLog(
        {
          entityType: 'OBSERVATION_BATCH',
          entityId: batch.id,
          action: AuditAction.CREATE,
          userId: user.id,
          afterJson: {
            type: batch.type,
            subjectId,
            observationCount: toNotify.length,
          },
        },
        manager,
      );

      return {
        id: batch.id,
        subjectId,
        projectId: subject.project.id,
        type: batch.type,
        observationCount: toNotify.length,
        sentAt: batch.sentAt,
      };
    });
  }

  async sendSemesterObservationsToFactory(
    semesterId: string,
    user: UserEntity,
  ): Promise<ObservationBatchResponseDto> {
    if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }

    return await this.dataSource.transaction(async (manager) => {
      const semester = await this.loadSemester(semesterId, manager);
      this.projectsService.assertCanManageAsProductOwner(semester.project, user);
      const subjectIds = semester.subjects.map((s) => s.id);
      if (!subjectIds.length) throw new BadRequestException('El semestre no tiene asignaturas.');

      const observationRepo = manager.getRepository(ObservationEntity);
      const pending = await observationRepo
        .createQueryBuilder('o')
        .where('o."subjectId" IN (:...subjectIds)', { subjectIds })
        .andWhere('o.role = :role', { role: UserRole.PRODUCT })
        .andWhere('o.status = :status', { status: ObservationStatus.ABIERTA })
        .andWhere('o."notificationStatus" = :notificationStatus', {
          notificationStatus: ObservationNotificationStatus.PENDING,
        })
        .orderBy('o."createdAt"', 'ASC')
        .getMany();

      if (pending.length === 0) {
        throw new BadRequestException('No hay observaciones pendientes de envio a Fabrica en este semestre.');
      }

      const now = new Date();
      const batchRepo = manager.getRepository(ObservationBatchEntity);
      const batch = await batchRepo.save(batchRepo.create({
        project: { id: semester.project.id },
        semester: { id: semesterId },
        subject: null,
        subjectId: null,
        scope: ObservationBatchScope.SEMESTER,
        type: ObservationBatchType.PRODUCT_OBSERVATIONS,
        senderRole: UserRole.PRODUCT,
        receiverRole: UserRole.FABRICA,
        sentAt: now,
        sentBy: { id: user.id },
        metadata: {
          observationIds: pending.map((o) => o.id),
          subjectIds: [...new Set(pending.map((o) => o.subjectId).filter(Boolean))],
        },
      }));

      for (const observation of pending) {
        observation.notificationStatus = ObservationNotificationStatus.SENT;
        observation.notificationBatch = batch;
        observation.sentAt = now;
        observation.sentBy = { id: user.id } as UserEntity;
        await observationRepo.save(observation);
      }

      await this.notificationsService.notifyFactoryOwner(
        semester.project.factoryOwner?.id,
        {
          type: NotificationType.ACTION,
          title: 'Observaciones de Product por semestre',
          message: `Product envio ${pending.length} observacion(es) del semestre ${semester.semesterNumber}.`,
          entityType: 'OBSERVATION_BATCH',
          entityId: batch.id,
          eventType: NotificationEventType.OBSERVATION_BATCH_SENT,
          projectId: semester.project.id,
          actionUrl: `/projects/${semester.project.id}/semesters/${semester.id}/operations`,
          severity: 'attention',
        },
        manager,
      );

      await this.auditService.createLog({
        entityType: 'OBSERVATION_BATCH',
        entityId: batch.id,
        action: AuditAction.CREATE,
        userId: user.id,
        afterJson: {
          type: batch.type,
          scope: batch.scope,
          semesterId,
          observationCount: pending.length,
        },
      }, manager);

      return {
        id: batch.id,
        subjectId: null,
        projectId: semester.project.id,
        type: batch.type,
        observationCount: pending.length,
        sentAt: batch.sentAt,
      };
    });
  }

  async notifySemesterCorrectionsToProduct(
    semesterId: string,
    user: UserEntity,
  ): Promise<ObservationBatchResponseDto> {
    if (user.role !== UserRole.FABRICA && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }

    return await this.dataSource.transaction(async (manager) => {
      const semester = await this.loadSemester(semesterId, manager);
      this.projectsService.assertCanModifyProject(semester.project, user);
      const subjectIds = semester.subjects.map((s) => s.id);
      if (!subjectIds.length) throw new BadRequestException('El semestre no tiene asignaturas.');

      const observationRepo = manager.getRepository(ObservationEntity);
      const openBlocking = await observationRepo
        .createQueryBuilder('o')
        .where('o."subjectId" IN (:...subjectIds)', { subjectIds })
        .andWhere('o.role = :role', { role: UserRole.PRODUCT })
        .andWhere('o.status = :status', { status: ObservationStatus.ABIERTA })
        .andWhere('o."notificationStatus" = :notificationStatus', {
          notificationStatus: ObservationNotificationStatus.SENT,
        })
        .getCount();
      if (openBlocking > 0) {
        throw new BadRequestException('Aun existen observaciones abiertas sin corregir en el semestre.');
      }

      const pendingCorrections = await observationRepo
        .createQueryBuilder('o')
        .where('o."subjectId" IN (:...subjectIds)', { subjectIds })
        .andWhere('o.status = :status', { status: ObservationStatus.EN_CORRECCION })
        .andWhere('o."correctionNotificationStatus" = :notificationStatus', {
          notificationStatus: ObservationNotificationStatus.PENDING,
        })
        .orderBy('o."updatedAt"', 'ASC')
        .getMany();

      if (pendingCorrections.length === 0) {
        throw new BadRequestException('No hay correcciones pendientes de notificar a Product en este semestre.');
      }

      const now = new Date();
      const batchRepo = manager.getRepository(ObservationBatchEntity);
      const batch = await batchRepo.save(batchRepo.create({
        project: { id: semester.project.id },
        semester: { id: semesterId },
        subject: null,
        subjectId: null,
        scope: ObservationBatchScope.SEMESTER,
        type: ObservationBatchType.FACTORY_CORRECTIONS,
        senderRole: UserRole.FABRICA,
        receiverRole: UserRole.PRODUCT,
        sentAt: now,
        sentBy: { id: user.id },
        metadata: {
          observationIds: pendingCorrections.map((o) => o.id),
          subjectIds: [...new Set(pendingCorrections.map((o) => o.subjectId).filter(Boolean))],
        },
      }));

      for (const observation of pendingCorrections) {
        observation.correctionNotificationStatus = ObservationNotificationStatus.SENT;
        await observationRepo.save(observation);
      }

      if (semester.project.productOwner?.id) {
        await this.notificationsService.notifyUser(semester.project.productOwner.id, {
          type: NotificationType.ACTION,
          title: 'Correcciones de Fabrica por semestre',
          message: `Fabrica notifico ${pendingCorrections.length} correccion(es) del semestre ${semester.semesterNumber}.`,
          entityType: 'OBSERVATION_BATCH',
          entityId: batch.id,
          eventType: NotificationEventType.CORRECTION_BATCH_NOTIFIED,
          projectId: semester.project.id,
          actionUrl: `/projects/${semester.project.id}/semesters/${semester.id}/operations`,
          severity: 'attention',
        }, manager);
      }

      await this.auditService.createLog({
        entityType: 'OBSERVATION_BATCH',
        entityId: batch.id,
        action: AuditAction.CREATE,
        userId: user.id,
        afterJson: {
          type: batch.type,
          scope: batch.scope,
          semesterId,
          observationCount: pendingCorrections.length,
        },
      }, manager);

      return {
        id: batch.id,
        subjectId: null,
        projectId: semester.project.id,
        type: batch.type,
        observationCount: pendingCorrections.length,
        sentAt: batch.sentAt,
      };
    });
  }

  private async loadSubject(subjectId: string, manager: EntityManager): Promise<SubjectEntity> {
    const subject = await manager.getRepository(SubjectEntity).findOne({
      where: { id: subjectId, deletedAt: IsNull() },
      relations: { project: { productOwner: true, factoryOwner: true }, semester: true },
    });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    return subject;
  }

  private async loadSemester(semesterId: string, manager: EntityManager): Promise<SemesterEntity> {
    const semester = await manager.getRepository(SemesterEntity).findOne({
      where: { id: semesterId, deletedAt: IsNull() },
      relations: { project: { productOwner: true, factoryOwner: true }, subjects: true },
    });
    if (!semester) {
      throw new NotFoundException('Semester not found');
    }
    return semester;
  }
}
