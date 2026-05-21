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
import { ProjectStatus } from '../common/enums/project-status.enum';
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

  @Index()
  @Column({ type: 'timestamptz' })
  expectedDeliveryDate!: Date;

  @Column({ type: 'text', nullable: true })
  observations!: string | null;

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
