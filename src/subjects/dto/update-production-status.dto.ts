import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum SubjectProductionStatusInput {
  PENDIENTE = 'PENDIENTE',
  EN_PRODUCCION = 'EN_PRODUCCION',
  COMPLETADA = 'COMPLETADA',
}

export class UpdateProductionStatusDto {
  @ApiProperty({ enum: SubjectProductionStatusInput })
  @IsEnum(SubjectProductionStatusInput)
  status!: SubjectProductionStatusInput;
}
