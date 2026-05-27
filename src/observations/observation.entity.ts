import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  RelationId,
  UpdateDateColumn,
} from 'typeorm';
import { ObservationNotificationStatus } from '../common/enums/observation-notification-status.enum';
import { ObservationStatus } from '../common/enums/observation-status.enum';
import { ObservationBatchEntity } from './observation-batch.entity';
import { Priority } from '../common/enums/priority.enum';
import { RelatedEntityType } from '../common/enums/related-entity-type.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { TopicEntity } from '../topics/topic.entity';
import { UserEntity } from '../users/user.entity';
import { ObservationMessageEntity } from './observation-message.entity';

@Entity({ name: 'observations' })
@Index(['relatedEntityType', 'relatedEntityId'])
export class ObservationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => ProjectEntity, (project) => project.observationsList, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'projectId' })
  project!: ProjectEntity;

  @RelationId((observation: ObservationEntity) => observation.project)
  projectId!: string;

  @Index()
  @ManyToOne(() => SubjectEntity, (subject) => subject.observations, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'subjectId' })
  subject!: SubjectEntity | null;

  @RelationId((observation: ObservationEntity) => observation.subject)
  subjectId!: string | null;

  @Index()
  @ManyToOne(() => TopicEntity, (topic) => topic.observations, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'topicId' })
  topic!: TopicEntity | null;

  @RelationId((observation: ObservationEntity) => observation.topic)
  topicId!: string | null;

  @Index()
  @ManyToOne(() => ChecklistItemEntity, (item) => item.observationsList, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'checklistItemId' })
  checklistItem!: ChecklistItemEntity | null;

  @RelationId((observation: ObservationEntity) => observation.checklistItem)
  checklistItemId!: string | null;

  @ManyToOne(() => UserEntity, (user) => user.authoredObservations, { nullable: false })
  @JoinColumn({ name: 'authorId' })
  author!: UserEntity;

  @Index()
  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role' })
  role!: UserRole;

  @Column({ type: 'text' })
  text!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: ObservationStatus,
    enumName: 'observation_status',
    default: ObservationStatus.ABIERTA,
  })
  status!: ObservationStatus;

  @Index()
  @Column({
    type: 'enum',
    enum: ObservationNotificationStatus,
    enumName: 'observation_notification_status',
    default: ObservationNotificationStatus.SENT,
  })
  notificationStatus!: ObservationNotificationStatus;

  @Column({
    type: 'enum',
    enum: ObservationNotificationStatus,
    enumName: 'observation_notification_status',
    nullable: true,
  })
  correctionNotificationStatus!: ObservationNotificationStatus | null;

  @Index()
  @ManyToOne(() => ObservationBatchEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'notificationBatchId' })
  notificationBatch!: ObservationBatchEntity | null;

  @RelationId((observation: ObservationEntity) => observation.notificationBatch)
  notificationBatchId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'sentById' })
  sentBy!: UserEntity | null;

  @RelationId((observation: ObservationEntity) => observation.sentBy)
  sentById!: string | null;

  @Column({ type: 'enum', enum: RelatedEntityType, enumName: 'related_entity_type' })
  relatedEntityType!: RelatedEntityType;

  @Column({ type: 'uuid' })
  relatedEntityId!: string;

  @Column({ type: 'enum', enum: Priority, enumName: 'priority', default: Priority.MEDIUM })
  priority!: Priority;

  @Column({ type: 'timestamptz', nullable: true })
  dueDate!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @ManyToOne(() => UserEntity, (user) => user.resolvedObservations, { nullable: true })
  @JoinColumn({ name: 'resolvedById' })
  resolvedBy!: UserEntity | null;

  @OneToMany(() => ObservationMessageEntity, (message) => message.observation)
  messages!: ObservationMessageEntity[];
}
