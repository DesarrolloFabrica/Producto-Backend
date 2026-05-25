import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export enum BulkApproveSectionScope {
  SUBJECT = 'SUBJECT',
  CATEGORY = 'CATEGORY',
  TOPIC = 'TOPIC',
}

export class BulkApproveSectionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  subjectId!: string;

  @ApiProperty({ enum: BulkApproveSectionScope })
  @IsEnum(BulkApproveSectionScope)
  scope!: BulkApproveSectionScope;

  @ApiPropertyOptional({ format: 'uuid', description: 'Requerido cuando scope es TOPIC' })
  @ValidateIf((dto: BulkApproveSectionDto) => dto.scope === BulkApproveSectionScope.TOPIC)
  @IsUUID()
  topicId?: string;

  @ApiPropertyOptional({
    description: 'Requerido cuando scope es CATEGORY (informacion_base, evaluacion_competencias, actividades_recursos)',
  })
  @ValidateIf((dto: BulkApproveSectionDto) => dto.scope === BulkApproveSectionScope.CATEGORY)
  @IsString()
  @MaxLength(120)
  category?: string;
}
