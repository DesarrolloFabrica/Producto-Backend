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
import { SubjectStatus } from '../common/enums/subject-status.enum';
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

  @Index()
  @Column({
    type: 'enum',
    enum: SubjectStatus,
    enumName: 'subject_status',
    default: SubjectStatus.PENDING,
  })
  status!: SubjectStatus;

  @Column({ type: 'int', default: 0 })
  progress!: number;

  @Column({ type: 'text', nullable: true })
  generalObservations!: string | null;

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
