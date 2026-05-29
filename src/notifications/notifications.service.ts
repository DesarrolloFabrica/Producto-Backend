import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Brackets, EntityManager, In, Repository } from 'typeorm';

import { NotificationEventType } from '../common/enums/notification-event-type.enum';

import { NotificationType } from '../common/enums/notification-type.enum';

import { UserRole } from '../common/enums/user-role.enum';

import { SubjectStatus } from '../common/enums/subject-status.enum';
import { ObservationStatus } from '../common/enums/observation-status.enum';
import { SubjectEntity } from '../subjects/subject.entity';
import { ObservationEntity } from '../observations/observation.entity';
import { UserEntity } from '../users/user.entity';

import {

  NotificationInboxQueryDto,

  NotificationInboxResponseDto,

  NotificationSummaryDto,

} from './dto/notification-inbox.dto';

import { NotificationResponseDto } from './dto/notification-response.dto';

import { NotificationEntity } from './notification.entity';



export interface NotifyPayload {

  type?: NotificationType;

  title: string;

  message: string;

  entityType?: string;

  entityId?: string;

  eventType?: NotificationEventType;

  projectId?: string;

  subjectId?: string;

  actionUrl?: string;

  severity?: string;

}



const ARCHIVE_AFTER_DAYS = 30;

const INFORMATIVE_EVENT_TYPES: NotificationEventType[] = [
  NotificationEventType.SUBJECT_APPROVED,
  NotificationEventType.OBSERVATION_VALIDATED,
  NotificationEventType.PROJECT_DELIVERED,
  NotificationEventType.PROJECT_CLOSED,
];

const FACTORY_PENDING_STATUSES: SubjectStatus[] = [
  SubjectStatus.PENDING,
  SubjectStatus.IN_PRODUCTION,
  SubjectStatus.CHANGES_REQUESTED,
];

const LEGACY_INFORMATIVE_TITLES = ['Asignatura aprobada', 'Materia aprobada'];



@Injectable()

export class NotificationsService {

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepo: Repository<NotificationEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
    @InjectRepository(ObservationEntity)
    private readonly observationRepo: Repository<ObservationEntity>,
  ) {}



  private recipientFilter(user: UserEntity) {
    if (user.role === UserRole.ADMIN) {
      return new Brackets((qb) => qb.where('1 = 1'));
    }

    return new Brackets((qb) => {

      qb.where('n.userId = :userId', { userId: user.id }).orWhere('n.roleTarget = :role', {

        role: user.role,

      });

    });

  }



  private async findDuplicate(

    repo: Repository<NotificationEntity>,

    params: {

      userId?: string | null;

      roleTarget?: UserRole | null;

      projectId?: string | null;

      subjectId?: string | null;

      eventType?: NotificationEventType | null;

      entityType?: string | null;

      entityId?: string | null;

    },

  ): Promise<NotificationEntity | null> {

    const qb = repo.createQueryBuilder('n').where('n.isRead = false');



    if (params.userId) {

      qb.andWhere('n.userId = :userId', { userId: params.userId });

    } else if (params.roleTarget) {

      qb.andWhere('n.roleTarget = :roleTarget', { roleTarget: params.roleTarget });

    }



    if (params.eventType) {

      qb.andWhere('n.eventType = :eventType', { eventType: params.eventType });

      if (params.projectId) {

        qb.andWhere('n.projectId = :projectId', { projectId: params.projectId });

      }

      if (params.subjectId) {

        qb.andWhere('n.subjectId = :subjectId', { subjectId: params.subjectId });

      }

      return (await qb.orderBy('n.createdAt', 'DESC').getOne()) ?? null;

    }



    if (params.entityType && params.entityId) {

      qb.andWhere('n.entityType = :entityType', { entityType: params.entityType }).andWhere(

        'n.entityId = :entityId',

        { entityId: params.entityId },

      );

      return (await qb.orderBy('n.createdAt', 'DESC').getOne()) ?? null;

    }



    return null;

  }



  private buildNotificationData(

    payload: NotifyPayload,

    userId: string | null,

    roleTarget: UserRole | null,

  ) {

    return {

      userId,

      user: userId ? { id: userId } : null,

      roleTarget,

      type: payload.type ?? NotificationType.INFO,

      title: payload.title,

      message: payload.message,

      entityType: payload.entityType ?? null,

      entityId: payload.entityId ?? null,

      eventType: payload.eventType ?? null,

      projectId: payload.projectId ?? null,

      subjectId: payload.subjectId ?? null,

      actionUrl: payload.actionUrl ?? null,

      severity: payload.severity ?? null,

      isRead: false,

      readAt: null,

    };

  }



  private async supersedePreviousUnread(

    repo: Repository<NotificationEntity>,

    saved: NotificationEntity,

  ): Promise<void> {

    if (!saved.subjectId && !saved.projectId) return;



    const qb = repo

      .createQueryBuilder()

      .update(NotificationEntity)

      .set({ isRead: true, readAt: new Date() })

      .where('isRead = false')

      .andWhere('id != :id', { id: saved.id });



    if (saved.userId) {

      qb.andWhere('userId = :userId', { userId: saved.userId });

    } else if (saved.roleTarget) {

      qb.andWhere('roleTarget = :roleTarget', { roleTarget: saved.roleTarget });

    }



    if (saved.subjectId) {

      qb.andWhere('subjectId = :subjectId', { subjectId: saved.subjectId });

    } else if (saved.projectId) {

      qb.andWhere('projectId = :projectId', { projectId: saved.projectId }).andWhere(

        'subjectId IS NULL',

      );

    }



    await qb.execute();

  }



  private recipientUpdateFilter(user: UserEntity) {
    return new Brackets((qb) => {
      qb.where('userId = :userId', { userId: user.id }).orWhere('roleTarget = :role', {
        role: user.role,
      });
    });
  }

  private async resolveObsoleteNotifications(user: UserEntity): Promise<void> {
    const now = new Date();

    await this.notificationRepo
      .createQueryBuilder()
      .update(NotificationEntity)
      .set({ isRead: true, readAt: now })
      .where('isRead = false')
      .andWhere(
        new Brackets((qb) => {
          qb.where('"eventType"::text IN (:...types)', {
            types: INFORMATIVE_EVENT_TYPES.map(String),
          }).orWhere('title IN (:...legacyTitles)', {
            legacyTitles: LEGACY_INFORMATIVE_TITLES,
          });
        }),
      )
      .andWhere(this.recipientUpdateFilter(user))
      .execute();

    const approvedSubjectRows = await this.subjectRepo
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .where('s.deletedAt IS NULL')
      .andWhere('s.status IN (:...terminal)', {
        terminal: [SubjectStatus.APPROVED, SubjectStatus.DELIVERED],
      })
      .getRawMany<{ id: string }>();

    const approvedSubjectIds = approvedSubjectRows.map((row) => row.id);
    if (approvedSubjectIds.length) {
      await this.notificationRepo
        .createQueryBuilder()
        .update(NotificationEntity)
        .set({ isRead: true, readAt: now })
        .where('isRead = false')
        .andWhere(
          new Brackets((qb) => {
            qb.where('subjectId IN (:...approvedSubjectIds)', { approvedSubjectIds }).orWhere(
              '"entityType" = :subjectEntity AND "entityId" IN (:...approvedSubjectIds)',
              { subjectEntity: 'SUBJECT', approvedSubjectIds },
            );
          }),
        )
        .andWhere(this.recipientUpdateFilter(user))
        .execute();
    }

    const resolvedObservationRows = await this.observationRepo
      .createQueryBuilder('o')
      .select('o.id', 'id')
      .where('o.status = :resolved', { resolved: ObservationStatus.RESUELTA })
      .getRawMany<{ id: string }>();

    const resolvedObservationIds = resolvedObservationRows.map((row) => row.id);
    if (resolvedObservationIds.length) {
      await this.notificationRepo
        .createQueryBuilder()
        .update(NotificationEntity)
        .set({ isRead: true, readAt: now })
        .where('isRead = false')
        .andWhere('"entityType" = :observationEntity', { observationEntity: 'OBSERVATION' })
        .andWhere('"entityId" IN (:...resolvedObservationIds)', { resolvedObservationIds })
        .andWhere(this.recipientUpdateFilter(user))
        .execute();
    }

    const pendingWorkRows = await this.subjectRepo
      .createQueryBuilder('s')
      .select('DISTINCT s.projectId', 'projectId')
      .where('s.deletedAt IS NULL')
      .andWhere('s.status IN (:...needsWork)', { needsWork: FACTORY_PENDING_STATUSES })
      .getRawMany<{ projectId: string }>();

    const projectsWithPendingWork = new Set(pendingWorkRows.map((row) => row.projectId));
    const allProjectRows = await this.subjectRepo
      .createQueryBuilder('s')
      .select('DISTINCT s.projectId', 'projectId')
      .where('s.deletedAt IS NULL')
      .getRawMany<{ projectId: string }>();

    const projectsWithoutPendingWork = allProjectRows
      .map((row) => row.projectId)
      .filter((projectId) => !projectsWithPendingWork.has(projectId));

    if (projectsWithoutPendingWork.length) {
      await this.notificationRepo
        .createQueryBuilder()
        .update(NotificationEntity)
        .set({ isRead: true, readAt: now })
        .where('isRead = false')
        .andWhere(
          new Brackets((qb) => {
            qb.where('projectId IN (:...projectIds)', {
              projectIds: projectsWithoutPendingWork,
            }).orWhere(
              '"entityType" = :projectEntity AND "entityId" IN (:...projectIds)',
              { projectEntity: 'PROJECT', projectIds: projectsWithoutPendingWork },
            );
          }),
        )
        .andWhere(
          new Brackets((qb) => {
            qb.where('subjectId IS NULL').orWhere('"eventType" = :projectModified', {
              projectModified: NotificationEventType.PROJECT_MODIFIED,
            });
          }),
        )
        .andWhere(this.recipientUpdateFilter(user))
        .execute();
    }
  }

  private async autoArchiveStale(user: UserEntity): Promise<void> {

    const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000);

    await this.notificationRepo

      .createQueryBuilder()

      .update(NotificationEntity)

      .set({ isRead: true, readAt: new Date() })

      .where('isRead = false')

      .andWhere('createdAt < :cutoff', { cutoff })

      .andWhere(

        new Brackets((qb) => {

          qb.where('userId = :userId', { userId: user.id }).orWhere('roleTarget = :role', {

            role: user.role,

          });

        }),

      )

      .execute();

  }

  /** Marca como leídas las informativas antiguas sin acción pendiente. */
  private async autoArchiveReadInformative(user: UserEntity): Promise<void> {
    const cutoff = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const now = new Date();
    await this.notificationRepo
      .createQueryBuilder()
      .update(NotificationEntity)
      .set({ isRead: true, readAt: now })
      .where('isRead = false')
      .andWhere('createdAt < :cutoff', { cutoff })
      .andWhere(
        new Brackets((qb) => {
          qb.where('type = :info', { info: NotificationType.INFO })
            .orWhere('"eventType"::text IN (:...informativeTypes)', {
              informativeTypes: INFORMATIVE_EVENT_TYPES.map(String),
            })
            .orWhere('title IN (:...legacyTitles)', {
              legacyTitles: LEGACY_INFORMATIVE_TITLES,
            });
        }),
      )
      .andWhere(this.recipientUpdateFilter(user))
      .execute();
  }



  async notifyUser(

    userId: string,

    payload: NotifyPayload,

    manager?: EntityManager,

  ): Promise<NotificationEntity> {

    const repo = manager ? manager.getRepository(NotificationEntity) : this.notificationRepo;

    const duplicate = await this.findDuplicate(repo, {

      userId,

      projectId: payload.projectId ?? null,

      subjectId: payload.subjectId ?? null,

      eventType: payload.eventType ?? null,

      entityType: payload.entityType ?? null,

      entityId: payload.entityId ?? null,

    });

    if (duplicate) {

      duplicate.message = payload.message;

      duplicate.title = payload.title;

      duplicate.type = payload.type ?? duplicate.type;

      duplicate.severity = payload.severity ?? duplicate.severity;

      duplicate.actionUrl = payload.actionUrl ?? duplicate.actionUrl;

      const saved = await repo.save(duplicate);

      await this.supersedePreviousUnread(repo, saved);

      return saved;

    }

    const notification = repo.create(this.buildNotificationData(payload, userId, null));

    const saved = await repo.save(notification);

    await this.supersedePreviousUnread(repo, saved);

    return saved;

  }



  async notifyRole(

    role: UserRole,

    payload: NotifyPayload,

    manager?: EntityManager,

  ): Promise<NotificationEntity> {

    const repo = manager ? manager.getRepository(NotificationEntity) : this.notificationRepo;

    const duplicate = await this.findDuplicate(repo, {

      roleTarget: role,

      projectId: payload.projectId ?? null,

      subjectId: payload.subjectId ?? null,

      eventType: payload.eventType ?? null,

      entityType: payload.entityType ?? null,

      entityId: payload.entityId ?? null,

    });

    if (duplicate) {

      duplicate.message = payload.message;

      duplicate.title = payload.title;

      duplicate.type = payload.type ?? duplicate.type;

      duplicate.severity = payload.severity ?? duplicate.severity;

      duplicate.actionUrl = payload.actionUrl ?? duplicate.actionUrl;

      const saved = await repo.save(duplicate);

      await this.supersedePreviousUnread(repo, saved);

      return saved;

    }

    const notification = repo.create(this.buildNotificationData(payload, null, role));

    const saved = await repo.save(notification);

    await this.supersedePreviousUnread(repo, saved);

    return saved;

  }



  async notifyFactoryOwner(

    factoryOwnerId: string | null | undefined,

    payload: NotifyPayload,

    manager?: EntityManager,

  ): Promise<void> {

    if (factoryOwnerId) {

      await this.notifyUser(factoryOwnerId, payload, manager);

    } else {

      await this.notifyRole(UserRole.FABRICA, payload, manager);

    }

  }



  async findInbox(

    user: UserEntity,

    query: NotificationInboxQueryDto = {},

  ): Promise<NotificationInboxResponseDto> {

    if (user.role !== UserRole.ADMIN) {
      await this.resolveObsoleteNotifications(user);

      await this.autoArchiveStale(user);

      await this.autoArchiveReadInformative(user);
    }



    const limit = query.limit ?? 15;

    const offset = query.offset ?? 0;

    const readDays = query.readDays ?? 3;

    const readCutoff = new Date(Date.now() - readDays * 24 * 60 * 60 * 1000);



    const baseQb = this.notificationRepo

      .createQueryBuilder('n')

      .leftJoinAndSelect('n.user', 'user')

      .where(this.recipientFilter(user))

      .andWhere(

        new Brackets((qb) => {

          qb.where('n.isRead = false').orWhere('n.readAt >= :readCutoff', { readCutoff }).orWhere(

            '(n.isRead = true AND n.readAt IS NULL AND n.createdAt >= :readCutoff)',

            { readCutoff },

          );

        }),

      );



    const notifications = await baseQb

      .orderBy('n.isRead', 'ASC')

      .addOrderBy('n.createdAt', 'DESC')

      .skip(offset)

      .take(limit + 1)

      .getMany();



    const hasMore = notifications.length > limit;

    const items = notifications.slice(0, limit).map((n) => this.toDto(n));

    const summary = await this.getSummary(user);



    return { summary, items, hasMore };

  }



  async getSummary(user: UserEntity): Promise<NotificationSummaryDto> {

    if (user.role !== UserRole.ADMIN) {
      await this.resolveObsoleteNotifications(user);
    }

    const actionableCount = await this.notificationRepo

      .createQueryBuilder('n')

      .where(this.recipientFilter(user))

      .andWhere('n.isRead = false')

      .andWhere('n.type IN (:...types)', {

        types: [NotificationType.ACTION, NotificationType.CRITICAL, NotificationType.DEADLINE],

      })

      .andWhere(
        new Brackets((qb) => {
          qb.where('n.eventType IS NULL').orWhere('n."eventType"::text NOT IN (:...informativeTypes)', {
            informativeTypes: INFORMATIVE_EVENT_TYPES.map(String),
          });
        }),
      )

      .getCount();



    const unreadCount = await this.notificationRepo

      .createQueryBuilder('n')

      .where(this.recipientFilter(user))

      .andWhere('n.isRead = false')

      .getCount();



    const readDays = 3;

    const readCutoff = new Date(Date.now() - readDays * 24 * 60 * 60 * 1000);

    const inboxCount = await this.notificationRepo

      .createQueryBuilder('n')

      .where(this.recipientFilter(user))

      .andWhere(

        new Brackets((qb) => {

          qb.where('n.isRead = false').orWhere('n.readAt >= :readCutoff', { readCutoff }).orWhere(

            '(n.isRead = true AND n.readAt IS NULL AND n.createdAt >= :readCutoff)',

            { readCutoff },

          );

        }),

      )

      .getCount();



    return { actionableCount, unreadCount, inboxCount };

  }



  async findForUser(user: UserEntity): Promise<NotificationResponseDto[]> {

    const inbox = await this.findInbox(user, { limit: 40, offset: 0, readDays: 7 });

    return inbox.items;

  }



  async dismissInformative(user: UserEntity): Promise<number> {
    const now = new Date();

    const result = await this.notificationRepo
      .createQueryBuilder()
      .update(NotificationEntity)
      .set({ isRead: true, readAt: now })
      .where('isRead = false')
      .andWhere(
        new Brackets((qb) => {
          qb.where('type = :info', { info: NotificationType.INFO })
            .orWhere('"eventType"::text IN (:...informativeTypes)', {
              informativeTypes: INFORMATIVE_EVENT_TYPES.map(String),
            })
            .orWhere('title IN (:...legacyTitles)', {
              legacyTitles: LEGACY_INFORMATIVE_TITLES,
            });
        }),
      )
      .andWhere(
        new Brackets((qb) => {
          qb.where('userId = :userId', { userId: user.id }).orWhere('roleTarget = :role', {
            role: user.role,
          });
        }),
      )
      .execute();

    return result.affected ?? 0;
  }

  async dismissNotifications(
    user: UserEntity,
    params: { ids?: string[]; projectId?: string; subjectId?: string },
  ): Promise<number> {
    if (params.ids?.length) {
      const notifications = await this.notificationRepo.find({
        where: { id: In(params.ids) },
        relations: { user: true },
      });

      if (!notifications.length) {
        return 0;
      }

      for (const notification of notifications) {
        this.assertCanAccess(notification, user);
      }

      const now = new Date();
      const result = await this.notificationRepo
        .createQueryBuilder()
        .update(NotificationEntity)
        .set({ isRead: true, readAt: now })
        .where('isRead = false')
        .andWhere('id IN (:...ids)', { ids: notifications.map((n) => n.id) })
        .andWhere(
          new Brackets((qb) => {
            qb.where('userId = :userId', { userId: user.id }).orWhere('roleTarget = :role', {
              role: user.role,
            });
          }),
        )
        .execute();

      return result.affected ?? 0;
    }

    return await this.markReadByResource(user, params);
  }

  async dismissNotification(id: string, user: UserEntity): Promise<NotificationResponseDto> {
    return await this.markRead(id, user);
  }



  async markRead(id: string, user: UserEntity): Promise<NotificationResponseDto> {

    const notification = await this.notificationRepo.findOne({

      where: { id },

      relations: { user: true },

    });

    if (!notification) {

      throw new NotFoundException('Notification not found');

    }

    this.assertCanAccess(notification, user);



    notification.isRead = true;

    notification.readAt = new Date();

    const saved = await this.notificationRepo.save(notification);

    return this.toDto(saved);

  }



  async markAllRead(user: UserEntity): Promise<number> {

    const now = new Date();

    const result = await this.notificationRepo

      .createQueryBuilder()

      .update(NotificationEntity)

      .set({ isRead: true, readAt: now })

      .where(

        new Brackets((qb) => {

          qb.where('userId = :userId', { userId: user.id }).orWhere('roleTarget = :role', {

            role: user.role,

          });

        }),

      )

      .andWhere('isRead = false')

      .execute();



    return result.affected ?? 0;

  }



  async markReadByResource(

    user: UserEntity,

    params: { projectId?: string; subjectId?: string },

  ): Promise<number> {

    if (!params.projectId && !params.subjectId) {

      return 0;

    }



    const now = new Date();

    const qb = this.notificationRepo

      .createQueryBuilder()

      .update(NotificationEntity)

      .set({ isRead: true, readAt: now })

      .where('isRead = false')

      .andWhere(

        new Brackets((sub) => {

          sub.where('userId = :userId', { userId: user.id }).orWhere('roleTarget = :role', {

            role: user.role,

          });

        }),

      );



    if (params.subjectId) {

      qb.andWhere('subjectId = :subjectId', { subjectId: params.subjectId });

    } else if (params.projectId) {

      qb.andWhere('projectId = :projectId', { projectId: params.projectId });

    }



    const result = await qb.execute();

    return result.affected ?? 0;

  }



  private assertCanAccess(notification: NotificationEntity, user: UserEntity): void {

    const notifUserId = notification.user?.id ?? notification.userId ?? null;

    const byUser = notifUserId === user.id;

    const byRole = notification.roleTarget === user.role;

    if (!byUser && !byRole) {

      throw new ForbiddenException();

    }

  }



  toDto(notification: NotificationEntity): NotificationResponseDto {

    return {

      id: notification.id,

      userId: notification.userId ?? notification.user?.id ?? null,

      roleTarget: notification.roleTarget,

      type: notification.type,

      title: notification.title,

      message: notification.message,

      isRead: notification.isRead,

      entityType: notification.entityType,

      entityId: notification.entityId,

      eventType: notification.eventType,

      projectId: notification.projectId,

      subjectId: notification.subjectId,

      actionUrl: notification.actionUrl,

      readAt: notification.readAt,

      severity: notification.severity,

      createdAt: notification.createdAt,

    };

  }

}


