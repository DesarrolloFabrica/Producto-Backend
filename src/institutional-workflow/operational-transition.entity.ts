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
import { SubjectEntity } from '../subjects/subject.entity';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'operational_transitions' })
export class OperationalTransitionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => SubjectEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subjectId' })
  subject!: SubjectEntity;

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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
