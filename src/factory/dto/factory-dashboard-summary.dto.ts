import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
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

  @ApiProperty({ description: 'Total de asignaturas visibles/asignadas para el usuario' })
  totalAssigned!: number;

  @ApiProperty({ type: [FactorySubjectWorkItemDto] })
  notStartedTop!: FactorySubjectWorkItemDto[];

  @ApiProperty({ type: [FactorySubjectWorkItemDto] })
  inProductionTop!: FactorySubjectWorkItemDto[];

  @ApiProperty({ type: [FactorySubjectWorkItemDto] })
  inReviewTop!: FactorySubjectWorkItemDto[];

  @ApiProperty({ type: [FactorySubjectWorkItemDto] })
  pendingCorrectionsTop!: FactorySubjectWorkItemDto[];

  @ApiProperty({ type: [FactorySubjectWorkItemDto] })
  upcomingDeliveriesTop!: FactorySubjectWorkItemDto[];

  @ApiProperty({ type: [FactorySubjectWorkItemDto] })
  recentlyCompletedTop!: FactorySubjectWorkItemDto[];

  @ApiProperty({ description: 'Cantidad de materias vencidas o proximas a vencer (<= 7 dias)', nullable: true })
  overdueOrDueSoonCount!: number;
}

export class FactorySubjectsQueryDto {
  @IsOptional()
  @IsString()
  @IsIn([
    SubjectOperationalState.NOT_STARTED,
    SubjectOperationalState.IN_PRODUCTION,
    SubjectOperationalState.IN_REVIEW,
    SubjectOperationalState.CHANGES_REQUESTED,
    SubjectOperationalState.CORRECTION_SENT,
    SubjectOperationalState.APPROVED,
  ])
  status?: SubjectOperationalState;

  @IsOptional()
  @IsString()
  @IsIn(['all', 'new', 'original'])
  origin?: 'all' | 'new' | 'original';

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  program?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  semester?: number;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  dueFrom?: string;

  @IsOptional()
  @IsDateString()
  dueTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsIn(['dueDate', 'updatedAt', 'priority'])
  sort?: 'dueDate' | 'updatedAt' | 'priority';
}
