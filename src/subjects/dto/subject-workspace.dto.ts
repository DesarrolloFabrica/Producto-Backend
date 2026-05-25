import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { ObservationResponseDto } from '../../observations/dto/observation-response.dto';
import {
  ProjectListItemDto,
  SemesterDetailDto,
  SubjectDetailDto,
} from '../../projects/dto/project-response.dto';
import { NotificationSummaryDto } from '../../notifications/dto/notification-inbox.dto';

export class SubjectWorkspaceProjectMetaDto extends OmitType(ProjectListItemDto, [
  'subjectsSummary',
] as const) {}

export class SubjectWorkspaceSemesterMetaDto extends OmitType(SemesterDetailDto, [
  'subjects',
] as const) {}

export class SubjectWorkspaceDto {
  @ApiProperty({ type: SubjectWorkspaceProjectMetaDto })
  projectMeta!: SubjectWorkspaceProjectMetaDto;

  @ApiProperty({ type: SubjectWorkspaceSemesterMetaDto })
  semesterMeta!: SubjectWorkspaceSemesterMetaDto;

  @ApiProperty({ type: SubjectDetailDto })
  subject!: SubjectDetailDto;

  @ApiProperty({ type: [ObservationResponseDto] })
  observations!: ObservationResponseDto[];

  @ApiPropertyOptional({ type: NotificationSummaryDto })
  notificationSummary?: NotificationSummaryDto;
}
