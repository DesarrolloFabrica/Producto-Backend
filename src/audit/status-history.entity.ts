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

@Entity({ name: 'status_history' })
@Index(['entityType', 'entityId'])
export class StatusHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  entityType!: string;

  @Column({ type: 'varchar', length: 36 })
  entityId!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  fromStatus!: string | null;

  @Column({ type: 'varchar', length: 80 })
  toStatus!: string;

  @Index()
  @ManyToOne(() => UserEntity, (user) => user.statusChanges, { nullable: false })
  @JoinColumn({ name: 'changedById' })
  changedBy!: UserEntity;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
