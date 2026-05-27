import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { NotificationResponseDto } from './notification-response.dto';

export class NotificationInboxQueryDto {
  @ApiPropertyOptional({ default: 40, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 15;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({
    default: 3,
    description: 'Días de retención para notificaciones ya vistas',
    minimum: 1,
    maximum: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  readDays?: number = 7;
}

export class NotificationSummaryDto {
  @ApiProperty({ description: 'Alertas que requieren acción (no leídas)' })
  actionableCount!: number;

  @ApiProperty({ description: 'Total sin leer (incluye informativas)' })
  unreadCount!: number;

  @ApiProperty({ description: 'Total en bandeja según retención' })
  inboxCount!: number;
}

export class NotificationInboxResponseDto {
  @ApiProperty({ type: NotificationSummaryDto })
  summary!: NotificationSummaryDto;

  @ApiProperty({ type: NotificationResponseDto, isArray: true })
  items!: NotificationResponseDto[];

  @ApiProperty()
  hasMore!: boolean;
}
