import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SemesterStatus } from '../common/enums/semester-status.enum';
import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { ProjectEntity } from '../projects/project.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'semesters' })
@Index('UQ_semesters_project_semester', ['projectId', 'semesterNumber'], { unique: true })
export class SemesterEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  projectId!: string;

  @Index()
  @ManyToOne(() => ProjectEntity, (project) => project.semesters, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project!: ProjectEntity;

  @Column({ type: 'int' })
  semesterNumber!: number;

  @Index()
  @Column({
    type: 'enum',
    enum: SemesterStatus,
    enumName: 'semester_status',
    default: SemesterStatus.PENDING,
  })
  status!: SemesterStatus;

  @Index()
  @Column({
    type: 'enum',
    enum: InstitutionalOperationalState,
    enumName: 'institutional_operational_state',
    name: 'operational_state',
    default: InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION,
  })
  operationalState!: InstitutionalOperationalState;

  @Column({
    type: 'timestamptz',
    name: 'operational_stage_entered_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  operationalStageEnteredAt!: Date;

  @Column({ type: 'timestamptz', name: 'operational_stage_due_at', nullable: true })
  operationalStageDueAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'operational_finalized_at', nullable: true })
  operationalFinalizedAt!: Date | null;

  @Column({ type: 'text', name: 'last_return_reason', nullable: true })
  lastReturnReason!: string | null;

  @Column({ type: 'timestamptz', name: 'last_return_at', nullable: true })
  lastReturnAt!: Date | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'last_return_by_id' })
  lastReturnBy!: UserEntity | null;

  @Column({ type: 'int', name: 'lock_version', default: 0 })
  lockVersion!: number;

  @Column({ type: 'timestamptz', nullable: true })
  factoryExpectedDate!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  continuationDate!: Date | null;

  @Column({ type: 'text', nullable: true })
  observations!: string | null;

  @Column({ type: 'boolean', default: false, name: 'created_from_change' })
  createdFromChange!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Index()
  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => SubjectEntity, (subject) => subject.semester)
  subjects!: SubjectEntity[];
}
