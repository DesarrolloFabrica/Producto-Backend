import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectInstitutionalState } from '../../common/enums/project-institutional-state.enum';
import { OperationalCheckKey, OperationalCheckStatus } from '../../common/enums/operational-check-key.enum';
import { UserRole } from '../../common/enums/user-role.enum';

export class InstitutionalClosureCheckDto {
  @ApiProperty({ enum: OperationalCheckKey })
  key!: OperationalCheckKey;

  @ApiProperty()
  label!: string;

  @ApiProperty({ enum: UserRole })
  responsibleRole!: UserRole;

  @ApiProperty({ enum: OperationalCheckStatus })
  status!: OperationalCheckStatus;

  @ApiPropertyOptional({ nullable: true })
  checkedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  checkedByName!: string | null;
}

export class InstitutionalClosureTimelineEventDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  action!: string;

  @ApiPropertyOptional({ nullable: true })
  scopeLabel!: string | null;

  @ApiProperty()
  actorName!: string;

  @ApiProperty({ enum: UserRole })
  actorRole!: UserRole;

  @ApiPropertyOptional({ nullable: true })
  comment!: string | null;

  @ApiPropertyOptional({ nullable: true })
  returnReason!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional({ description: 'Movimientos de semestre fusionados en este hito' })
  mergedCount?: number;
}

export class ProjectInstitutionalClosureDto {
  @ApiProperty()
  projectId!: string;

  @ApiProperty()
  program!: string;

  @ApiProperty()
  school!: string;

  @ApiProperty({ enum: ProjectInstitutionalState, nullable: true })
  projectInstitutionalState!: ProjectInstitutionalState | null;

  @ApiPropertyOptional({ nullable: true })
  radicationNumber!: string | null;

  @ApiPropertyOptional({ nullable: true })
  radicatedAt!: string | null;

  @ApiProperty()
  scopeSubjectsApproved!: number;

  @ApiProperty()
  scopeSubjectsTotal!: number;

  @ApiProperty()
  scopeSemesters!: number;

  @ApiProperty({ type: [InstitutionalClosureCheckDto] })
  checks!: InstitutionalClosureCheckDto[];

  @ApiProperty({ type: [InstitutionalClosureTimelineEventDto] })
  timeline!: InstitutionalClosureTimelineEventDto[];

  @ApiProperty({ description: 'Total de transiciones antes de consolidar por hito' })
  timelineRawCount!: number;
}
