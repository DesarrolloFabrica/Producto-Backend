import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ObservationBatchType } from '../common/enums/observation-batch-type.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { ProjectEntity } from '../projects/project.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'observation_batches' })
export class ObservationBatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => ProjectEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project!: ProjectEntity;

  @Column({ type: 'uuid' })
  projectId!: string;

  @Index()
  @ManyToOne(() => SubjectEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subjectId' })
  subject!: SubjectEntity;

  @Column({ type: 'uuid' })
  subjectId!: string;

  @Column({ type: 'enum', enum: ObservationBatchType, enumName: 'observation_batch_type' })
  type!: ObservationBatchType;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role' })
  senderRole!: UserRole;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role' })
  receiverRole!: UserRole;

  @Column({ type: 'timestamptz' })
  sentAt!: Date;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'sentById' })
  sentBy!: UserEntity;

  @Column({ type: 'uuid' })
  sentById!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
