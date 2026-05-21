import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RejectSubjectDto {
  @ApiPropertyOptional({ description: 'Motivo del rechazo (no crea observación)' })
  @IsOptional()
  @IsString()
  reason?: string;
}
