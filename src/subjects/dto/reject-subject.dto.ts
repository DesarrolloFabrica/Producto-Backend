import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RejectSubjectDto {
  @ApiProperty({ description: 'Motivo obligatorio del rechazo y base de la observación automática' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  reason?: string;
}
