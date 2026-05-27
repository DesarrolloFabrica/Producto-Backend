import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InstitutionalOperationalAction } from '../../common/enums/institutional-operational-action.enum';
import { InstitutionalOperationalState } from '../../common/enums/institutional-operational-state.enum';
import { SlaStatus } from '../../common/enums/sla-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';

export class LmsDashboardKpisDto {
  @ApiProperty()
  pendingUpload!: number;

  @ApiProperty()
  inUpload!: number;

  @ApiProperty()
  completedUpload!: number;

  @ApiProperty()
  returnedByPlanning!: number;

  @ApiProperty()
  inProgressProjects!: number;

  @ApiProperty()
  finalizedProjects!: number;
}

export class LmsActivityItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['subject'] })
  kind!: 'subject';

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ format: 'uuid' })
  subjectId!: string;

  @ApiProperty()
  subjectName!: string;

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

export class LmsSubjectPreviewDto {
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

  @ApiProperty()
  semesterNumber!: number;

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

  @ApiProperty({ enum: InstitutionalOperationalAction, isArray: true })
  availableActions!: InstitutionalOperationalAction[];
}

export class LmsFinalizedProjectDto {
  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty()
  program!: string;

  @ApiProperty()
  school!: string;

  @ApiProperty()
  subjectsCount!: number;
}

export class LmsDashboardSummaryDto {
  @ApiProperty({ type: LmsDashboardKpisDto })
  kpis!: LmsDashboardKpisDto;

  @ApiProperty({ type: [LmsActivityItemDto] })
  recentActivity!: LmsActivityItemDto[];

  @ApiProperty({ type: [LmsSubjectPreviewDto] })
  returnedPreview!: LmsSubjectPreviewDto[];

  @ApiProperty({ type: [LmsSubjectPreviewDto] })
  completedPreview!: LmsSubjectPreviewDto[];
}
