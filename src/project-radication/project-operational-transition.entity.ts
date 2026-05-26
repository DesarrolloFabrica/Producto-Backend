import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProjectInstitutionalAction } from '../common/enums/project-institutional-action.enum';
import { ProjectInstitutionalState } from '../common/enums/project-institutional-state.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { ProjectEntity } from '../projects/project.entity';
import { UserEntity } from '../users/user.entity';

@Entity({ name: 'project_operational_transitions' })
export class ProjectOperationalTransitionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ProjectEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project!: ProjectEntity;

  @Column({
    type: 'enum',
    enum: ProjectInstitutionalState,
    enumName: 'project_institutional_state',
    nullable: true,
  })
  fromState!: ProjectInstitutionalState | null;

  @Column({
    type: 'enum',
    enum: ProjectInstitutionalState,
    enumName: 'project_institutional_state',
  })
  toState!: ProjectInstitutionalState;

  @Column({
    type: 'enum',
    enum: ProjectInstitutionalAction,
    enumName: 'project_institutional_action',
  })
  action!: ProjectInstitutionalAction;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'actorId' })
  actor!: UserEntity;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role' })
  actorRole!: UserRole;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ type: 'text', nullable: true })
  returnReason!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  evidenceUrl!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  radicationNumber!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
