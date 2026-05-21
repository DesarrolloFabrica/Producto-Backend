import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Priority } from '../../common/enums/priority.enum';
import { RelatedEntityType } from '../../common/enums/related-entity-type.enum';

export class CreateObservationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  projectId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  topicId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  checklistItemId?: string;

  @ApiProperty({ enum: RelatedEntityType })
  @IsEnum(RelatedEntityType)
  relatedEntityType!: RelatedEntityType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  relatedEntityId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiProperty({ enum: Priority, default: Priority.MEDIUM })
  @IsEnum(Priority)
  priority!: Priority;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;
}
