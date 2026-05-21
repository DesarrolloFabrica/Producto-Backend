import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from '../users/user.entity';
import { ObservationEntity } from './observation.entity';

@Entity({ name: 'observation_messages' })
export class ObservationMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => ObservationEntity, (observation) => observation.messages, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'observationId' })
  observation!: ObservationEntity;

  @Index()
  @ManyToOne(() => UserEntity, (user) => user.observationMessages, { nullable: false })
  @JoinColumn({ name: 'authorId' })
  author!: UserEntity;

  @Column({ type: 'text' })
  message!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
