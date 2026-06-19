import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AuditLogEntity } from '../audit/audit-log.entity';
import { StatusHistoryEntity } from '../audit/status-history.entity';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { NotificationEntity } from '../notifications/notification.entity';
import { ObservationMessageEntity } from '../observations/observation-message.entity';
import { ObservationEntity } from '../observations/observation.entity';
import { ProjectEntity } from '../projects/project.entity';
import { UserRole } from '../common/enums/user-role.enum';
import { UserStatus } from '../common/enums/user-status.enum';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Index()
  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role' })
  role!: UserRole;

  @Index()
  @Column({ type: 'enum', enum: UserStatus, enumName: 'user_status', default: UserStatus.ACTIVE })
  status!: UserStatus;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  passwordHash!: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  permissions!: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => ProjectEntity, (project) => project.productOwner)
  productProjects!: ProjectEntity[];

  @OneToMany(() => ProjectEntity, (project) => project.factoryOwner)
  factoryProjects!: ProjectEntity[];

  @OneToMany(() => ObservationEntity, (observation) => observation.author)
  authoredObservations!: ObservationEntity[];

  @OneToMany(() => ObservationEntity, (observation) => observation.resolvedBy)
  resolvedObservations!: ObservationEntity[];

  @OneToMany(() => ObservationMessageEntity, (message) => message.author)
  observationMessages!: ObservationMessageEntity[];

  @OneToMany(() => ChecklistItemEntity, (item) => item.updatedBy)
  updatedChecklistItems!: ChecklistItemEntity[];

  @OneToMany(() => AuditLogEntity, (log) => log.user)
  auditLogs!: AuditLogEntity[];

  @OneToMany(() => StatusHistoryEntity, (history) => history.changedBy)
  statusChanges!: StatusHistoryEntity[];

  @OneToMany(() => NotificationEntity, (notification) => notification.user)
  notifications!: NotificationEntity[];
}
