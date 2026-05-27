import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InstitutionalOperationalAction } from '../../common/enums/institutional-operational-action.enum';
import { InstitutionalOperationalState } from '../../common/enums/institutional-operational-state.enum';
import { OperationalCheckKey, OperationalCheckStatus } from '../../common/enums/operational-check-key.enum';
import { SlaStatus } from '../../common/enums/sla-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';

export class OperationalCheckDto {
  @ApiProperty({ enum: OperationalCheckKey })
  key!: OperationalCheckKey;

  @ApiProperty()
  label!: string;

  @ApiProperty({ enum: UserRole })
  responsibleRole!: UserRole;

  @ApiProperty({ enum: OperationalCheckStatus })
  status!: OperationalCheckStatus;

  @ApiPropertyOptional({ nullable: true })
  checkedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  checkedByName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  comment!: string | null;

  @ApiPropertyOptional({ nullable: true })
  evidenceUrl!: string | null;
}

export class OperationalTransitionRecordDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ enum: InstitutionalOperationalState, nullable: true })
  fromState!: InstitutionalOperationalState | null;

  @ApiProperty({ enum: InstitutionalOperationalState })
  toState!: InstitutionalOperationalState;

  @ApiProperty({ enum: InstitutionalOperationalAction })
  action!: InstitutionalOperationalAction;

  @ApiProperty()
  actorName!: string;

  @ApiProperty({ enum: UserRole })
  actorRole!: UserRole;

  @ApiPropertyOptional({ nullable: true })
  comment!: string | null;

  @ApiPropertyOptional({ nullable: true })
  returnReason!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class OperationalWorkItemDto {
  @ApiProperty()
  subjectId!: string;

  @ApiProperty()
  subjectName!: string;

  @ApiProperty()
  projectId!: string;

  @ApiProperty()
  program!: string;

  @ApiProperty()
  school!: string;

  @ApiProperty()
  semesterNumber!: number;

  @ApiProperty({ enum: InstitutionalOperationalState })
  operationalState!: InstitutionalOperationalState;

  @ApiProperty({ enum: UserRole })
  currentResponsibleRole!: UserRole;

  @ApiPropertyOptional({ nullable: true })
  stageDueAt!: Date | null;

  @ApiProperty({ enum: SlaStatus })
  slaStatus!: SlaStatus;

  @ApiProperty({ enum: InstitutionalOperationalAction, isArray: true })
  availableActions!: InstitutionalOperationalAction[];

  @ApiPropertyOptional({ nullable: true })
  lastReturnReason!: string | null;

  @ApiProperty()
  actionUrl!: string;
}

export class OperationalWorkspaceDto {
  @ApiProperty()
  subjectId!: string;

  @ApiProperty()
  subjectName!: string;

  @ApiProperty()
  projectId!: string;

  @ApiProperty()
  semesterId!: string;

  @ApiProperty()
  semesterNumber!: number;

  @ApiProperty()
  program!: string;

  @ApiProperty()
  school!: string;

  @ApiProperty({ enum: InstitutionalOperationalState })
  operationalState!: InstitutionalOperationalState;

  @ApiProperty()
  academicReviewEnabled!: boolean;

  @ApiProperty()
  academicChecklistEnabled!: boolean;

  @ApiProperty()
  academicReviewReady!: boolean;

  @ApiProperty()
  correctionInFactory!: boolean;

  @ApiProperty()
  institutionalFlowActive!: boolean;

  @ApiProperty({ enum: SlaStatus })
  slaStatus!: SlaStatus;

  @ApiPropertyOptional({ nullable: true })
  stageDueAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  lastReturnReason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastReturnAt!: Date | null;

  @ApiProperty({ type: [OperationalCheckDto] })
  checks!: OperationalCheckDto[];

  @ApiProperty({ type: [OperationalTransitionRecordDto] })
  timeline!: OperationalTransitionRecordDto[];

  @ApiProperty({ enum: InstitutionalOperationalAction, isArray: true })
  availableActions!: InstitutionalOperationalAction[];

  @ApiPropertyOptional()
  academicApprovalReady?: boolean;

  @ApiPropertyOptional({ type: [String] })
  academicApprovalBlockers?: string[];
}
