import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { NotificationEventType } from '../../common/enums/notification-event-type.enum';

export class MarkReadByResourceDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;
}

export class MarkReadByResourceResponseDto {
  @ApiProperty()
  updatedCount!: number;
}

export { NotificationEventType };
