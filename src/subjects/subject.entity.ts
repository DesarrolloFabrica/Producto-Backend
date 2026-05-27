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
import { FactoryProductionStatus } from '../common/enums/factory-production-status.enum';
import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { SubjectStatus } from '../common/enums/subject-status.enum';
import { UserEntity } from '../users/user.entity';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { ObservationEntity } from '../observations/observation.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { TopicEntity } from '../topics/topic.entity';

@Entity({ name: 'subjects' })
export class SubjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => ProjectEntity, (project) => project.subjects, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project!: ProjectEntity;

  @Index()
  @ManyToOne(() => SemesterEntity, (semester) => semester.subjects, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'semesterId' })
  semester!: SemesterEntity;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'timestamptz', nullable: true })
  expectedDeliveryDate!: Date | null;

  @Index()
  @Column({
    type: 'enum',
    enum: SubjectStatus,
    enumName: 'subject_status',
    default: SubjectStatus.PENDING,
  })
  status!: SubjectStatus;

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

  @Column({ type: 'int', default: 0 })
  progress!: number;

  @Index()
  @Column({
    type: 'enum',
    enum: FactoryProductionStatus,
    enumName: 'factory_production_status',
    name: 'factory_production_status',
    default: FactoryProductionStatus.NOT_STARTED,
  })
  factoryProductionStatus!: FactoryProductionStatus;

  @Column({ type: 'timestamptz', name: 'factory_production_completed_at', nullable: true })
  factoryProductionCompletedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  generalObservations!: string | null;

  @Column({ type: 'boolean', default: false, name: 'created_from_change' })
  createdFromChange!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Index()
  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => TopicEntity, (topic) => topic.subject)
  topics!: TopicEntity[];

  @OneToMany(() => ChecklistItemEntity, (item) => item.subject)
  checklist!: ChecklistItemEntity[];

  @OneToMany(() => ObservationEntity, (observation) => observation.subject)
  observations!: ObservationEntity[];
}
