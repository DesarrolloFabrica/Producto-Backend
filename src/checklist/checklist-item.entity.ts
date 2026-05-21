import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ChecklistStatus } from '../common/enums/checklist-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { ObservationEntity } from '../observations/observation.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { TopicEntity } from '../topics/topic.entity';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'checklist_items' })
export class ChecklistItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => SubjectEntity, (subject) => subject.checklist, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subjectId' })
  subject!: SubjectEntity;

  @Index()
  @ManyToOne(() => TopicEntity, (topic) => topic.checklist, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'topicId' })
  topic!: TopicEntity | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  category!: string | null;

  @Column({ type: 'varchar', length: 255 })
  label!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: ChecklistStatus,
    enumName: 'checklist_status',
    default: ChecklistStatus.PENDIENTE,
  })
  status!: ChecklistStatus;

  @Index()
  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role' })
  ownerRole!: UserRole;

  @Column({ type: 'text', nullable: true })
  observations!: string | null;

  @ManyToOne(() => UserEntity, (user) => user.updatedChecklistItems, { nullable: true })
  @JoinColumn({ name: 'updatedById' })
  updatedBy!: UserEntity | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => ObservationEntity, (observation) => observation.checklistItem)
  observationsList!: ObservationEntity[];
}
