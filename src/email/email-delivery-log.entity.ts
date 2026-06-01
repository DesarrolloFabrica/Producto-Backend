import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EmailDeliveryStatus } from '../common/enums/email-delivery-status.enum';
import { NotificationEntity } from '../notifications/notification.entity';

@Entity({ name: 'email_delivery_logs' })
export class EmailDeliveryLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => NotificationEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'notificationId' })
  notification!: NotificationEntity | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  eventType!: string | null;

  @Column({ type: 'varchar', length: 254 })
  originalRecipient!: string;

  @Column({ type: 'varchar', length: 254 })
  effectiveRecipient!: string;

  @Column({ type: 'varchar', length: 500 })
  subject!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: EmailDeliveryStatus,
    enumName: 'email_delivery_status',
  })
  status!: EmailDeliveryStatus;

  @Column({ type: 'varchar', length: 40 })
  provider!: string;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
