import { ApiProperty } from '@nestjs/swagger';
import { SubjectOperationalState } from '../../common/enums/subject-operational-state.enum';
import { FactorySubjectWorkItemDto } from './factory-subject-work-item.dto';

export class FactoryDashboardCountsDto {
  @ApiProperty()
  NOT_STARTED!: number;

  @ApiProperty()
  IN_PRODUCTION!: number;

  @ApiProperty()
  IN_REVIEW!: number;

  @ApiProperty()
  CHANGES_REQUESTED!: number;

  @ApiProperty()
  CORRECTION_SENT!: number;

  @ApiProperty()
  APPROVED!: number;
}

export class FactoryDashboardSummaryDto {
  @ApiProperty({ type: FactoryDashboardCountsDto })
  countsByState!: FactoryDashboardCountsDto;

  @ApiProperty({ type: [FactorySubjectWorkItemDto] })
  pendingCorrections!: FactorySubjectWorkItemDto[];

  @ApiProperty({ type: [FactorySubjectWorkItemDto] })
  upcomingDeliveries!: FactorySubjectWorkItemDto[];

  @ApiProperty({ type: [FactorySubjectWorkItemDto] })
  recentlyCompleted!: FactorySubjectWorkItemDto[];
}

export class FactorySubjectsQueryDto {
  status?: SubjectOperationalState;
  projectId?: string;
  program?: string;
  semester?: number;
  priority?: string;
  search?: string;
  dueFrom?: string;
  dueTo?: string;
  page?: number;
  limit?: number;
  sort?: 'dueDate' | 'updatedAt' | 'priority';
}
