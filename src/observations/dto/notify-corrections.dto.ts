import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsUUID } from 'class-validator';

export class NotifyCorrectionsDto {
  @ApiPropertyOptional({
    description: 'IDs de observaciones EN_CORRECCION pendientes de notificar. Si se omite, se notifican todas.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  observationIds?: string[];
}
