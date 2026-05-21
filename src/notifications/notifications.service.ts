import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, Repository } from 'typeorm';
import { NotificationType } from '../common/enums/notification-type.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { UserEntity } from '../users/user.entity';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationEntity } from './notification.entity';

export interface NotifyPayload {
  type?: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepo: Repository<NotificationEntity>,
  ) {}

  async notifyUser(
    userId: string,
    payload: NotifyPayload,
    manager?: EntityManager,
  ): Promise<NotificationEntity> {
    const repo = manager ? manager.getRepository(NotificationEntity) : this.notificationRepo;
    const notification = repo.create({
      userId,
      user: { id: userId },
      roleTarget: null,
      type: payload.type ?? NotificationType.INFO,
      title: payload.title,
      message: payload.message,
      entityType: payload.entityType ?? null,
      entityId: payload.entityId ?? null,
      isRead: false,
    });
    return await repo.save(notification);
  }

  async notifyRole(
    role: UserRole,
    payload: NotifyPayload,
    manager?: EntityManager,
  ): Promise<NotificationEntity> {
    const repo = manager ? manager.getRepository(NotificationEntity) : this.notificationRepo;
    const notification = repo.create({
      user: null,
      roleTarget: role,
      type: payload.type ?? NotificationType.INFO,
      title: payload.title,
      message: payload.message,
      entityType: payload.entityType ?? null,
      entityId: payload.entityId ?? null,
      isRead: false,
    });
    return await repo.save(notification);
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

  async findForUser(user: UserEntity): Promise<NotificationResponseDto[]> {
    const notifications = await this.notificationRepo
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.user', 'user')
      .where('n.userId = :userId', { userId: user.id })
      .orWhere('n.roleTarget = :role', { role: user.role })
      .orderBy('n.createdAt', 'DESC')
      .getMany();

    return notifications.map((n) => this.toDto(n));
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
    const saved = await this.notificationRepo.save(notification);
    return this.toDto(saved);
  }

  async markAllRead(user: UserEntity): Promise<number> {
    const result = await this.notificationRepo
      .createQueryBuilder()
      .update(NotificationEntity)
      .set({ isRead: true })
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

  private assertCanAccess(notification: NotificationEntity, user: UserEntity): void {
    const notifUserId = notification.user?.id ?? null;
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
      createdAt: notification.createdAt,
    };
  }
}
