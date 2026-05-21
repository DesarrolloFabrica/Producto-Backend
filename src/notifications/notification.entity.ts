import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NotificationType } from '../common/enums/notification-type.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'notifications' })
@Index(['entityType', 'entityId'])
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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
