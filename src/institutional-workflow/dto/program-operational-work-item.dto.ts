import { ApiProperty } from '@nestjs/swagger';
import { SlaStatus } from '../../common/enums/sla-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';

export class ProgramActiveStageSummaryDto {
  @ApiProperty({ example: 'Revisión académica' })
  label!: string;

  @ApiProperty({ example: 2 })
  count!: number;
}

export class ProgramOperationalWorkItemDto {
  @ApiProperty({ enum: ['program'] })
  kind!: 'program';

  @ApiProperty()
  projectId!: string;

  @ApiProperty()
  program!: string;

  @ApiProperty()
  school!: string;

  @ApiProperty()
  totalSemesters!: number;

  @ApiProperty()
  completedSemesters!: number;

  @ApiProperty()
  totalSubjects!: number;

  @ApiProperty()
  completedSubjects!: number;

  @ApiProperty()
  pendingSubjects!: number;

  @ApiProperty()
  academicReviewPendingCount!: number;

  @ApiProperty({ type: [ProgramActiveStageSummaryDto] })
  activeStageSummary!: ProgramActiveStageSummaryDto[];

  @ApiProperty({ nullable: true })
  nearestDueDate!: Date | null;

  @ApiProperty({ enum: SlaStatus })
  slaStatus!: SlaStatus;

  @ApiProperty({ enum: UserRole })
  currentResponsibleRole!: UserRole;

  @ApiProperty()
  openObservations!: number;

  @ApiProperty()
  actionUrl!: string;

  @ApiProperty({ nullable: true, description: 'Responsable Product que creó la solicitud' })
  productOwnerName!: string | null;

  @ApiProperty({
    description: 'Semestres del programa para drill-down',
    isArray: true,
  })
  semesters!: object[];
}
