import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { ProjectEntity } from './project.entity';

@Entity({ name: 'link_resources' })
export class LinkResourceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => ProjectEntity, (project) => project.links, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project!: ProjectEntity;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'varchar', length: 2048 })
  url!: string;

  @Index()
  @Column({ type: 'varchar', length: 80 })
  type!: string;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role' })
  uploadedBy!: UserRole;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
