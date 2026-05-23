import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddSubjectDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  topics!: string[];

  @ApiProperty({ description: 'Fecha de entrega esperada de la asignatura' })
  @IsString()
  @IsNotEmpty()
  @IsDateString()
  expectedDeliveryDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  changeReason?: string;
}
