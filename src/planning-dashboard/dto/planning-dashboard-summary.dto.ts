import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InstitutionalOperationalState } from '../../common/enums/institutional-operational-state.enum';
import { SlaStatus } from '../../common/enums/sla-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';

export class PlanningDashboardKpisDto {
  @ApiProperty()
  initialValidations!: number;

  @ApiProperty()
  productionValidations!: number;

  @ApiProperty()
  lmsValidations!: number;

  @ApiProperty()
  radicationsPending!: number;

  @ApiProperty()
  inProgress!: number;

  @ApiProperty()
  finalized!: number;
}

export class PlanningActivityItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['subject', 'project'] })
  kind!: 'subject' | 'project';

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  subjectId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  subjectName!: string | null;

  @ApiProperty()
  program!: string;

  @ApiProperty()
  school!: string;

  @ApiProperty()
  actionLabel!: string;

  @ApiPropertyOptional({ nullable: true })
  comment!: string | null;

  @ApiPropertyOptional({ nullable: true })
  returnReason!: string | null;

  @ApiProperty()
  actorName!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  deepLink!: string;
}

export class PlanningSubjectPreviewDto {
  @ApiProperty({ format: 'uuid' })
  subjectId!: string;

  @ApiProperty()
  subjectName!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty()
  program!: string;

  @ApiProperty()
  school!: string;

  @ApiProperty({ enum: InstitutionalOperationalState })
  operationalState!: InstitutionalOperationalState;

  @ApiPropertyOptional({ nullable: true })
  stageDueAt!: Date | null;

  @ApiProperty({ enum: SlaStatus })
  slaStatus!: SlaStatus;

  @ApiPropertyOptional({ nullable: true })
  lastReturnReason!: string | null;

  @ApiProperty({ enum: UserRole })
  currentResponsibleRole!: UserRole;
}

export class PlanningFinalizedProjectDto {
  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty()
  program!: string;

  @ApiProperty()
  school!: string;

  @ApiPropertyOptional({ nullable: true })
  radicationNumber!: string | null;

  @ApiPropertyOptional({ nullable: true })
  radicatedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  finalizedAt!: Date | null;

  @ApiProperty()
  productOwnerName!: string;

  @ApiProperty()
  subjectsCount!: number;

  @ApiProperty()
  semestersCount!: number;
}

export class PlanningDashboardSummaryDto {
  @ApiProperty({ type: PlanningDashboardKpisDto })
  kpis!: PlanningDashboardKpisDto;

  @ApiProperty({ type: [PlanningActivityItemDto] })
  recentActivity!: PlanningActivityItemDto[];

  @ApiProperty({ type: [PlanningSubjectPreviewDto] })
  returnedPreview!: PlanningSubjectPreviewDto[];

  @ApiProperty({ type: [PlanningFinalizedProjectDto] })
  finalizedProjects!: PlanningFinalizedProjectDto[];
}
