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
import { ProjectEntity } from '../projects/project.entity';
import { SubjectEntity } from '../subjects/subject.entity';

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

  @Column({ type: 'timestamptz' })
  factoryExpectedDate!: Date;

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
