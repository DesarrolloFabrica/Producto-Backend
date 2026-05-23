import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RequestSubjectCorrectionDto {
  @ApiProperty({ description: 'Observación obligatoria que explica la corrección solicitada a Fábrica' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  reason!: string;
}
