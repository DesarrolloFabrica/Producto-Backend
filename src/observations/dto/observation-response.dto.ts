import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ObservationStatus } from '../../common/enums/observation-status.enum';
import { Priority } from '../../common/enums/priority.enum';
import { RelatedEntityType } from '../../common/enums/related-entity-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { ProjectOwnerDto } from '../../projects/dto/project-response.dto';

export class ObservationMessageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: ProjectOwnerDto })
  author!: ProjectOwnerDto;

  @ApiProperty()
  message!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class ObservationChecklistRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  label!: string;
}

export class ObservationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  subjectId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  topicId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  checklistItemId!: string | null;

  @ApiProperty({ type: ProjectOwnerDto })
  author!: ProjectOwnerDto;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty()
  text!: string;

  @ApiProperty({ enum: ObservationStatus })
  status!: ObservationStatus;

  @ApiProperty({ enum: RelatedEntityType })
  relatedEntityType!: RelatedEntityType;

  @ApiProperty({ format: 'uuid' })
  relatedEntityId!: string;

  @ApiProperty({ enum: Priority })
  priority!: Priority;

  @ApiPropertyOptional({ nullable: true })
  dueDate!: Date | null;

  @ApiPropertyOptional({ type: ProjectOwnerDto, nullable: true })
  resolvedBy!: ProjectOwnerDto | null;

  @ApiPropertyOptional({ nullable: true })
  resolvedAt!: Date | null;

  @ApiPropertyOptional({ type: ObservationChecklistRefDto, nullable: true })
  checklistItem!: ObservationChecklistRefDto | null;

  @ApiProperty({ type: [ObservationMessageResponseDto] })
  messages!: ObservationMessageResponseDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
