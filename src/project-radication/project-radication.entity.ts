import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProjectRadicationStatus } from '../common/enums/project-radication-status.enum';
import { ProjectEntity } from '../projects/project.entity';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'project_radications' })
export class ProjectRadicationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ProjectEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project!: ProjectEntity;

  @Column({ type: 'varchar', length: 120 })
  radicationNumber!: string;

  @Column({ type: 'timestamptz' })
  radicatedAt!: Date;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'registeredById' })
  registeredBy!: UserEntity;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  evidenceUrl!: string | null;

  @Column({
    type: 'enum',
    enum: ProjectRadicationStatus,
    enumName: 'project_radication_status',
    default: ProjectRadicationStatus.ACTIVE,
  })
  status!: ProjectRadicationStatus;

  @Column({ type: 'text', nullable: true })
  returnReason!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  returnedAt!: Date | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'returnedById' })
  returnedBy!: UserEntity | null;

  @Column({ type: 'timestamptz', nullable: true })
  validatedAt!: Date | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'validatedById' })
  validatedBy!: UserEntity | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
