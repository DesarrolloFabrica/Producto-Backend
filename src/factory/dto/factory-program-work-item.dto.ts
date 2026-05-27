import { ApiProperty } from '@nestjs/swagger';
import { FactorySubjectWorkItemDto } from './factory-subject-work-item.dto';

export class FactoryProgramActiveStageSummaryDto {
  @ApiProperty()
  label!: string;

  @ApiProperty()
  count!: number;
}

export class FactoryProgramWorkItemDto {
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

  @ApiProperty({ type: [FactoryProgramActiveStageSummaryDto] })
  activeStageSummary!: FactoryProgramActiveStageSummaryDto[];

  @ApiProperty({ nullable: true })
  nearestDueDate!: Date | null;

  @ApiProperty()
  openObservations!: number;

  @ApiProperty()
  actionUrl!: string;

  @ApiProperty({ type: [FactorySubjectWorkItemDto] })
  semesters!: FactorySubjectWorkItemDto[];
}

export class FactoryProgramsPageDto {
  @ApiProperty({ type: [FactoryProgramWorkItemDto] })
  items!: FactoryProgramWorkItemDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
