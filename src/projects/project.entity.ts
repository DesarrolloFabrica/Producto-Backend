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
import { Modality } from '../common/enums/modality.enum';
import { Priority } from '../common/enums/priority.enum';
import { ProjectInstitutionalState } from '../common/enums/project-institutional-state.enum';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { SubjectMatterExpertStatus } from '../common/enums/subject-matter-expert-status.enum';
import { SubjectMatterExpertType } from '../common/enums/subject-matter-expert-type.enum';
import { LinkResourceEntity } from './link-resource.entity';
import { ObservationEntity } from '../observations/observation.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'projects' })
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  school!: string;

  @Column({ type: 'varchar', length: 200 })
  program!: string;

  @Column({ type: 'enum', enum: Modality, enumName: 'modality' })
  modality!: Modality;

  @Column({ type: 'varchar', length: 120 })
  requestType!: string;

  @Index()
  @Column({ type: 'enum', enum: Priority, enumName: 'priority', default: Priority.MEDIUM })
  priority!: Priority;

  @Index()
  @Column({
    type: 'enum',
    enum: ProjectStatus,
    enumName: 'project_status',
    default: ProjectStatus.READY_FOR_PRODUCTION,
  })
  status!: ProjectStatus;

  @Column({ type: 'int', default: 0 })
  progress!: number;

  @Index()
  @ManyToOne(() => UserEntity, (user) => user.productProjects, { nullable: false })
  @JoinColumn({ name: 'productOwnerId' })
  productOwner!: UserEntity;

  @Index()
  @ManyToOne(() => UserEntity, (user) => user.factoryProjects, { nullable: true })
  @JoinColumn({ name: 'factoryOwnerId' })
  factoryOwner!: UserEntity | null;

  @Column({
    type: 'enum',
    enum: SubjectMatterExpertType,
    enumName: 'subject_matter_expert_type',
    default: SubjectMatterExpertType.INTERNAL,
  })
  subjectMatterExpertType!: SubjectMatterExpertType;

  @Index()
  @Column({
    type: 'enum',
    enum: SubjectMatterExpertStatus,
    enumName: 'subject_matter_expert_status',
    default: SubjectMatterExpertStatus.READY,
  })
  subjectMatterExpertStatus!: SubjectMatterExpertStatus;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  expectedDeliveryDate!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  activatedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expertConfirmedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  observations!: string | null;

  @Column({ type: 'boolean', default: false, name: 'legacy_workflow' })
  legacyWorkflow!: boolean;

  @Index()
  @Column({
    type: 'enum',
    enum: ProjectInstitutionalState,
    enumName: 'project_institutional_state',
    name: 'institutional_state',
    nullable: true,
  })
  institutionalState!: ProjectInstitutionalState | null;

  @Column({ type: 'timestamptz', name: 'institutional_scope_locked_at', nullable: true })
  institutionalScopeLockedAt!: Date | null;

  @Column({ type: 'varchar', length: 120, name: 'radication_number', nullable: true })
  radicationNumber!: string | null;

  @Column({ type: 'timestamptz', name: 'radicated_at', nullable: true })
  radicatedAt!: Date | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'radicated_by_id' })
  radicatedBy!: UserEntity | null;

  @Column({ type: 'text', name: 'radication_comment', nullable: true })
  radicationComment!: string | null;

  @Column({ type: 'varchar', length: 500, name: 'radication_evidence_url', nullable: true })
  radicationEvidenceUrl!: string | null;

  @Column({ type: 'timestamptz', name: 'ready_for_radication_at', nullable: true })
  readyForRadicationAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'product_radication_due_at', nullable: true })
  productRadicationDueAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'planning_radication_check_due_at', nullable: true })
  planningRadicationCheckDueAt!: Date | null;

  @Column({ type: 'text', name: 'last_radication_return_reason', nullable: true })
  lastRadicationReturnReason!: string | null;

  @Column({ type: 'timestamptz', name: 'last_radication_returned_at', nullable: true })
  lastRadicationReturnedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Index()
  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => SemesterEntity, (semester) => semester.project)
  semesters!: SemesterEntity[];

  @OneToMany(() => SubjectEntity, (subject) => subject.project)
  subjects!: SubjectEntity[];

  @OneToMany(() => ObservationEntity, (observation) => observation.project)
  observationsList!: ObservationEntity[];

  @OneToMany(() => LinkResourceEntity, (link) => link.project)
  links!: LinkResourceEntity[];
}
