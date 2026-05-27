import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InstitutionalOperationalAction } from '../common/enums/institutional-operational-action.enum';
import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { SemesterEntity } from '../semesters/semester.entity';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'semester_operational_transitions' })
export class SemesterOperationalTransitionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => SemesterEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'semesterId' })
  semester!: SemesterEntity;

  @Column({
    type: 'enum',
    enum: InstitutionalOperationalState,
    enumName: 'institutional_operational_state',
    nullable: true,
  })
  fromState!: InstitutionalOperationalState | null;

  @Column({
    type: 'enum',
    enum: InstitutionalOperationalState,
    enumName: 'institutional_operational_state',
  })
  toState!: InstitutionalOperationalState;

  @Column({
    type: 'enum',
    enum: InstitutionalOperationalAction,
    enumName: 'institutional_operational_action',
  })
  action!: InstitutionalOperationalAction;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'actorId' })
  actor!: UserEntity;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role' })
  actorRole!: UserRole;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ type: 'text', nullable: true })
  returnReason!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  evidenceUrl!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
