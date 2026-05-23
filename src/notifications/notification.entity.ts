import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NotificationEventType } from '../common/enums/notification-event-type.enum';
import { NotificationType } from '../common/enums/notification-type.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'notifications' })
@Index(['entityType', 'entityId'])
@Index(['projectId', 'subjectId', 'eventType'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Index()
  @ManyToOne(() => UserEntity, (user) => user.notifications, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity | null;

  @Index()
  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role', nullable: true })
  roleTarget!: UserRole | null;

  @Column({
    type: 'enum',
    enum: NotificationType,
    enumName: 'notification_type',
    default: NotificationType.INFO,
  })
  type!: NotificationType;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Index()
  @Column({ type: 'boolean', default: false })
  isRead!: boolean;

  @Column({ type: 'varchar', length: 80, nullable: true })
  entityType!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  entityId!: string | null;

  @Column({
    type: 'enum',
    enum: NotificationEventType,
    enumName: 'notification_event_type',
    nullable: true,
  })
  eventType!: NotificationEventType | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  projectId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  subjectId!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  actionUrl!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  severity!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
