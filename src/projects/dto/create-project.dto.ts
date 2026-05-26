import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
import { SubjectMatterExpertType } from '../../common/enums/subject-matter-expert-type.enum';
import { SUBJECT_TOPICS_RANGE_MESSAGE } from '../../common/constants/subject-topics.constants';

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

  @ApiProperty({ type: [String], example: ['Tema 1', 'Tema 2', 'Tema 3', 'Tema 4', 'Tema 5'], minItems: 4, maxItems: 6 })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @ArrayMinSize(4, { message: SUBJECT_TOPICS_RANGE_MESSAGE })
  @ArrayMaxSize(6, { message: SUBJECT_TOPICS_RANGE_MESSAGE })
  topics!: string[];
}

export class CreateProjectSemesterDto {
  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  semesterNumber!: number;

  @ApiPropertyOptional({
    example: '2026-08-15T00:00:00.000Z',
    description: 'Ignorado en creación; el backend calcula la fecha al activar la solicitud.',
  })
  @IsOptional()
  @IsISO8601()
  factoryExpectedDate?: string;

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

  @ApiProperty({ enum: SubjectMatterExpertType, example: SubjectMatterExpertType.INTERNAL })
  @IsEnum(SubjectMatterExpertType)
  subjectMatterExpertType!: SubjectMatterExpertType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  requestType!: string;

  @ApiProperty({ enum: Priority })
  @IsEnum(Priority)
  priority!: Priority;

  @ApiPropertyOptional({
    example: '2026-12-31T00:00:00.000Z',
    description: 'Ignorado en creación; el backend calcula la fecha al activar la solicitud.',
  })
  @IsOptional()
  @IsISO8601()
  expectedDeliveryDate?: string;

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
