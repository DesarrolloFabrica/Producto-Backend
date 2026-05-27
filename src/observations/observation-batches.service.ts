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
import { SubjectEntity } from '../subjects/subject.entity';
import { UserEntity } from '../users/user.entity';
import { ObservationBatchResponseDto } from './dto/observation-batch-response.dto';
import { ObservationBatchEntity } from './observation-batch.entity';
import { ObservationEntity } from './observation.entity';

@Injectable()
export class ObservationBatchesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
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
  ): Promise<ObservationBatchResponseDto> {
    if (user.role !== UserRole.FABRICA && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException();
    }

    return await this.dataSource.transaction(async (manager) => {
      const subject = await this.loadSubject(subjectId, manager);
      this.projectsService.assertCanModifyProject(subject.project, user);

      const observationRepo = manager.getRepository(ObservationEntity);
      const openBlocking = await observationRepo.count({
        where: {
          subject: { id: subjectId },
          role: UserRole.PRODUCT,
          status: ObservationStatus.ABIERTA,
          notificationStatus: ObservationNotificationStatus.SENT,
        },
      });
      if (openBlocking > 0) {
        throw new BadRequestException(
          'Aún existen observaciones abiertas sin corregir. Aplícalas antes de notificar a Product.',
        );
      }

      const pendingCorrections = await observationRepo.find({
        where: {
          subject: { id: subjectId },
          status: ObservationStatus.EN_CORRECCION,
          correctionNotificationStatus: ObservationNotificationStatus.PENDING,
        },
        relations: { checklistItem: true, topic: true },
        order: { updatedAt: 'ASC' },
      });

      if (pendingCorrections.length === 0) {
        throw new BadRequestException('No hay correcciones pendientes de notificar a Product.');
      }

      const now = new Date();
      const batchRepo = manager.getRepository(ObservationBatchEntity);
      const batch = await batchRepo.save(
        batchRepo.create({
          project: { id: subject.project.id },
          subject: { id: subjectId },
          type: ObservationBatchType.FACTORY_CORRECTIONS,
          senderRole: UserRole.FABRICA,
          receiverRole: UserRole.PRODUCT,
          sentAt: now,
          sentBy: { id: user.id },
          metadata: {
            observationIds: pendingCorrections.map((o) => o.id),
          },
        }),
      );

      for (const observation of pendingCorrections) {
        observation.correctionNotificationStatus = ObservationNotificationStatus.SENT;
        await observationRepo.save(observation);
      }

      if (subject.project.productOwner?.id) {
        await this.notificationsService.notifyUser(
          subject.project.productOwner.id,
          {
            type: NotificationType.ACTION,
            title: 'Correcciones de Fábrica',
            message: `Fábrica notificó ${pendingCorrections.length} corrección(es) en ${subject.name}.`,
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
        observations: pendingCorrections,
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
            observationCount: pendingCorrections.length,
          },
        },
        manager,
      );

      return {
        id: batch.id,
        subjectId,
        projectId: subject.project.id,
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
}
