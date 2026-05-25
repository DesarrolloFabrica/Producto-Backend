import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Priority } from '../../common/enums/priority.enum';
import { SubjectOperationalState } from '../../common/enums/subject-operational-state.enum';

export class FactorySubjectWorkItemDto {
  @ApiProperty({ format: 'uuid' })
  subjectId!: string;

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

  @ApiProperty({ description: 'True si la materia fue agregada después de la solicitud inicial' })
  createdFromChange!: boolean;
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
