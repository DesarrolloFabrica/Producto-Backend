import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SUBJECT_TOPICS_RANGE_MESSAGE } from '../../common/constants/subject-topics.constants';

export class AddSubjectDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ type: [String], minItems: 4, maxItems: 6 })
  @IsArray()
  @ArrayMinSize(4, { message: SUBJECT_TOPICS_RANGE_MESSAGE })
  @ArrayMaxSize(6, { message: SUBJECT_TOPICS_RANGE_MESSAGE })
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
