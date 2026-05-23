import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AddSemesterSubjectDto {
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
