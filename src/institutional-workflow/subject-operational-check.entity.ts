import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { OperationalCheckKey, OperationalCheckStatus } from '../common/enums/operational-check-key.enum';
import { UserEntity } from '../users/user.entity';
import { SubjectEntity } from '../subjects/subject.entity';

@Entity({ name: 'subject_operational_checks' })
@Unique(['subject', 'checkKey'])
export class SubjectOperationalCheckEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => SubjectEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subjectId' })
  subject!: SubjectEntity;

  @Column({ type: 'enum', enum: OperationalCheckKey, enumName: 'operational_check_key' })
  checkKey!: OperationalCheckKey;

  @Column({ type: 'varchar', length: 200 })
  label!: string;

  @Column({
    type: 'enum',
    enum: OperationalCheckStatus,
    enumName: 'operational_check_status',
    default: OperationalCheckStatus.PENDING,
  })
  status!: OperationalCheckStatus;

  @Column({ type: 'timestamptz', nullable: true })
  checkedAt!: Date | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'checkedById' })
  checkedBy!: UserEntity | null;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  evidenceUrl!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
