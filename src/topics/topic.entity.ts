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
import { ChecklistItemEntity } from '../checklist/checklist-item.entity';
import { ObservationEntity } from '../observations/observation.entity';
import { SubjectEntity } from '../subjects/subject.entity';

@Entity({ name: 'topics' })
@Index('UQ_topics_subject_order', ['subjectId', 'order'], { unique: true })
export class TopicEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  subjectId!: string;

  @Index()
  @ManyToOne(() => SubjectEntity, (subject) => subject.topics, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subjectId' })
  subject!: SubjectEntity;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'int' })
  order!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Index()
  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => ChecklistItemEntity, (item) => item.topic)
  checklist!: ChecklistItemEntity[];

  @OneToMany(() => ObservationEntity, (observation) => observation.topic)
  observations!: ObservationEntity[];
}
