import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Modality } from '../../common/enums/modality.enum';
import { ProjectInstitutionalState } from '../../common/enums/project-institutional-state.enum';
import { Priority } from '../../common/enums/priority.enum';
import { ProjectStatus } from '../../common/enums/project-status.enum';
import { SubjectMatterExpertStatus } from '../../common/enums/subject-matter-expert-status.enum';
import { SubjectMatterExpertType } from '../../common/enums/subject-matter-expert-type.enum';
import { ChecklistStatus } from '../../common/enums/checklist-status.enum';
import { SemesterStatus } from '../../common/enums/semester-status.enum';
import { FactoryProductionStatus } from '../../common/enums/factory-production-status.enum';
import { SubjectOperationalState } from '../../common/enums/subject-operational-state.enum';
import { SubjectStatus } from '../../common/enums/subject-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  ProjectChangeTimelineEntryDto,
  ProjectRecentChangesDto,
} from './project-change-tracking.dto';

export class ProjectOwnerDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;
}

export class SubjectSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: SubjectStatus })
  status!: SubjectStatus;

  @ApiProperty({ enum: SubjectOperationalState })
  operationalState!: SubjectOperationalState;

  @ApiProperty()
  semesterNumber!: number;

  @ApiProperty({ description: 'True si la materia fue agregada después de la solicitud inicial' })
  createdFromChange!: boolean;

  @ApiPropertyOptional({ nullable: true })
  expectedDeliveryDate!: Date | null;

  @ApiProperty()
  progress!: number;

  @ApiProperty()
  openObservationsCount!: number;

  @ApiProperty()
  correctionSentCount!: number;

  @ApiProperty()
  updatedAt!: Date;
}

export class ProjectListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  school!: string;

  @ApiProperty()
  program!: string;

  @ApiProperty({ enum: Modality })
  modality!: Modality;

  @ApiProperty()
  requestType!: string;

  @ApiProperty({ enum: Priority })
  priority!: Priority;

  @ApiProperty({ enum: ProjectStatus })
  status!: ProjectStatus;

  @ApiPropertyOptional({
    enum: ProjectInstitutionalState,
    nullable: true,
    description: 'Estado del workflow institucional por proyecto (radicación, cierre).',
  })
  institutionalState?: ProjectInstitutionalState | null;

  @ApiProperty()
  progress!: number;

  @ApiPropertyOptional({ nullable: true })
  expectedDeliveryDate!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  activatedAt!: Date | null;

  @ApiProperty({ enum: SubjectMatterExpertType })
  subjectMatterExpertType!: SubjectMatterExpertType;

  @ApiProperty({ enum: SubjectMatterExpertStatus })
  subjectMatterExpertStatus!: SubjectMatterExpertStatus;

  @ApiPropertyOptional({ nullable: true })
  expertConfirmedAt!: Date | null;

  @ApiProperty({ type: ProjectOwnerDto })
  productOwner!: ProjectOwnerDto;

  @ApiPropertyOptional({ type: ProjectOwnerDto, nullable: true })
  factoryOwner!: ProjectOwnerDto | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ type: [SubjectSummaryDto] })
  subjectsSummary?: SubjectSummaryDto[];
}

class PaginationMetaDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;

  @ApiProperty()
  hasNextPage!: boolean;

  @ApiProperty()
  hasPreviousPage!: boolean;
}

export class PaginatedProjectListResponseDto {
  @ApiProperty({ type: [ProjectListItemDto] })
  items!: ProjectListItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class ProjectLinkDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty({ enum: UserRole })
  uploadedBy!: UserRole;

  @ApiProperty()
  createdAt!: Date;
}

export class ChecklistItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  subjectId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  topicId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  category!: string | null;

  @ApiProperty()
  label!: string;

  @ApiProperty({ enum: ChecklistStatus })
  status!: ChecklistStatus;

  @ApiProperty({ enum: UserRole })
  ownerRole!: UserRole;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class TopicDetailDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  order!: number;

  @ApiProperty({ type: [ChecklistItemDto] })
  checklist!: ChecklistItemDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class SubjectDetailDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  expectedDeliveryDate!: Date | null;

  @ApiProperty({ enum: SubjectStatus })
  status!: SubjectStatus;

  @ApiProperty({ enum: SubjectOperationalState })
  operationalState!: SubjectOperationalState;

  @ApiProperty()
  progress!: number;

  @ApiProperty({ enum: FactoryProductionStatus })
  factoryProductionStatus!: FactoryProductionStatus;

  @ApiPropertyOptional({ nullable: true })
  factoryProductionCompletedAt!: Date | null;

  @ApiProperty({ description: 'True si la materia fue agregada después de la solicitud inicial' })
  createdFromChange!: boolean;

  @ApiProperty({ type: [TopicDetailDto] })
  topics!: TopicDetailDto[];

  @ApiProperty({ type: [ChecklistItemDto] })
  checklist!: ChecklistItemDto[];

  @ApiProperty()
  openObservationsCount!: number;

  @ApiProperty()
  correctionSentCount!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class SemesterDetailDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  semesterNumber!: number;

  @ApiProperty({ enum: SemesterStatus })
  status!: SemesterStatus;

  @ApiProperty({ description: 'True si el semestre fue agregado después de la solicitud inicial' })
  createdFromChange!: boolean;

  @ApiPropertyOptional({ nullable: true })
  factoryExpectedDate!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  continuationDate!: Date | null;

  @ApiProperty({ type: [SubjectDetailDto] })
  subjects!: SubjectDetailDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class ProjectDetailDto extends ProjectListItemDto {
  @ApiPropertyOptional({ nullable: true })
  observations!: string | null;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: [SemesterDetailDto] })
  semesters!: SemesterDetailDto[];

  @ApiProperty({ type: [ProjectLinkDto] })
  links!: ProjectLinkDto[];

  @ApiPropertyOptional({ type: ProjectRecentChangesDto })
  recentChanges?: ProjectRecentChangesDto;

  @ApiPropertyOptional({ type: [ProjectChangeTimelineEntryDto] })
  changeTimeline?: ProjectChangeTimelineEntryDto[];
}
