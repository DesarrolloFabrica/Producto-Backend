import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Priority } from '../../common/enums/priority.enum';
import { SubjectOperationalState } from '../../common/enums/subject-operational-state.enum';

export class FactorySubjectWorkItemDto {
  @ApiProperty({ format: 'uuid' })
  subjectId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  semesterId?: string | null;

  @ApiProperty()
  subjectName!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty()
  program!: string;

  @ApiProperty()
  school!: string;

  @ApiProperty()
  semesterNumber!: number;

  @ApiPropertyOptional({ nullable: true })
  expectedDeliveryDate!: Date | null;

  @ApiProperty({ enum: Priority })
  priority!: Priority;

  @ApiProperty({ enum: SubjectOperationalState })
  operationalState!: SubjectOperationalState;

  @ApiProperty()
  openObservationsCount!: number;

  @ApiProperty()
  correctionSentCount!: number;

  @ApiPropertyOptional({ nullable: true })
  lastActivity!: Date | null;

  @ApiProperty()
  actionUrl!: string;

  @ApiProperty({ description: 'True si el semestre fue agregado despues de la solicitud inicial' })
  createdFromChange!: boolean;

  @ApiPropertyOptional()
  subjectsTotal?: number;

  @ApiPropertyOptional()
  subjectsReady?: number;
}

export class FactorySubjectsPageDto {
  @ApiProperty({ type: [FactorySubjectWorkItemDto] })
  items!: FactorySubjectWorkItemDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
