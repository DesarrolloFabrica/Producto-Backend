import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectInstitutionalState } from '../../common/enums/project-institutional-state.enum';

export class ProjectRadicationWorkItemDto {
  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty()
  school!: string;

  @ApiProperty()
  program!: string;

  @ApiProperty({ enum: ProjectInstitutionalState })
  institutionalState!: ProjectInstitutionalState;

  @ApiPropertyOptional({ nullable: true })
  radicationNumber!: string | null;

  @ApiPropertyOptional({ nullable: true })
  radicatedAt!: Date | null;

  @ApiProperty()
  scopeSubjectsTotal!: number;

  @ApiProperty()
  scopeSubjectsApproved!: number;

  @ApiPropertyOptional({ nullable: true })
  productRadicationDueAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  planningRadicationCheckDueAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  lastRadicationReturnReason!: string | null;
}
