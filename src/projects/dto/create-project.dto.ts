import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Modality } from '../../common/enums/modality.enum';
import { Priority } from '../../common/enums/priority.enum';

export class CreateProjectSyllabusDto {
  @ApiProperty()
  @IsBoolean()
  hasSyllabus!: boolean;

  @ApiPropertyOptional()
  @ValidateIf((o: CreateProjectSyllabusDto) => o.hasSyllabus === true)
  @IsNotEmpty()
  @IsUrl()
  url?: string;
}

export class CreateProjectTopicDto {
  @ApiProperty({ example: 'Introducción al curso' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class CreateProjectSubjectDto {
  @ApiProperty({ example: 'Matemáticas I' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ type: [String], example: ['Tema 1', 'Tema 2'] })
  @IsString({ each: true })
  @ArrayMinSize(1)
  topics!: string[];
}

export class CreateProjectSemesterDto {
  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  semesterNumber!: number;

  @ApiProperty({ example: '2026-08-15T00:00:00.000Z' })
  @IsISO8601()
  factoryExpectedDate!: string;

  @ApiProperty({ type: [CreateProjectSubjectDto] })
  @ValidateNested({ each: true })
  @Type(() => CreateProjectSubjectDto)
  @ArrayMinSize(1)
  subjects!: CreateProjectSubjectDto[];
}

export class CreateProjectDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  school!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  program!: string;

  @ApiProperty({ enum: Modality })
  @IsEnum(Modality)
  modality!: Modality;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  requestType!: string;

  @ApiProperty({ enum: Priority })
  @IsEnum(Priority)
  priority!: Priority;

  @ApiProperty({ example: '2026-12-31T00:00:00.000Z' })
  @IsISO8601()
  expectedDeliveryDate!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  factoryOwnerId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Solo ADMIN puede asignar otro product owner' })
  @IsOptional()
  @IsUUID()
  productOwnerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observations?: string;

  @ApiPropertyOptional({ type: CreateProjectSyllabusDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateProjectSyllabusDto)
  syllabus?: CreateProjectSyllabusDto;

  @ApiProperty({ type: [CreateProjectSemesterDto] })
  @ValidateNested({ each: true })
  @Type(() => CreateProjectSemesterDto)
  @ArrayMinSize(1)
  semesters!: CreateProjectSemesterDto[];
}
