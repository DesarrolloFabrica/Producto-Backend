import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { SUBJECT_TOPICS_RANGE_MESSAGE } from '../../common/constants/subject-topics.constants';

export class AddSemesterSubjectDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @ValidateIf((o: AddSemesterSubjectDto) => (o.topics?.length ?? 0) > 0)
  @ArrayMinSize(4, { message: SUBJECT_TOPICS_RANGE_MESSAGE })
  @ArrayMaxSize(6, { message: SUBJECT_TOPICS_RANGE_MESSAGE })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  topics?: string[];
}

export class AddSemesterDto {
  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  semesterNumber!: number;

  @ApiProperty()
  @IsISO8601()
  factoryExpectedDate!: string;

  @ApiProperty({ type: [AddSemesterSubjectDto] })
  @ValidateNested({ each: true })
  @Type(() => AddSemesterSubjectDto)
  @ArrayMinSize(1)
  subjects!: AddSemesterSubjectDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  changeReason?: string;
}
