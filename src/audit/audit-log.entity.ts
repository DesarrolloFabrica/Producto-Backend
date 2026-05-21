import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditAction } from '../common/enums/audit-action.enum';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'audit_logs' })
@Index(['entityType', 'entityId'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  entityType!: string;

  @Column({ type: 'varchar', length: 36 })
  entityId!: string;

  @Index()
  @Column({ type: 'enum', enum: AuditAction, enumName: 'audit_action' })
  action!: AuditAction;

  @Index()
  @ManyToOne(() => UserEntity, (user) => user.auditLogs, { nullable: false })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  @Column({ type: 'jsonb', nullable: true })
  beforeJson!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  afterJson!: Record<string, unknown> | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
