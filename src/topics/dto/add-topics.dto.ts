import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SUBJECT_TOPICS_RANGE_MESSAGE } from '../../common/constants/subject-topics.constants';

export class AddTopicsDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 6 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6, { message: SUBJECT_TOPICS_RANGE_MESSAGE })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  topics!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  changeReason?: string;
}
