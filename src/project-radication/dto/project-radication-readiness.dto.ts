import { ApiProperty } from '@nestjs/swagger';
import { ProjectInstitutionalState } from '../../common/enums/project-institutional-state.enum';

export class RadicationScopeSemesterDto {
  @ApiProperty()
  semesterNumber!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  approved!: number;

  @ApiProperty()
  pending!: number;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  statesBreakdown!: Record<string, number>;
}

export class RadicationScopeDto {
  @ApiProperty()
  semesters!: number;

  @ApiProperty()
  subjectsTotal!: number;

  @ApiProperty()
  subjectsApproved!: number;

  @ApiProperty()
  subjectsPending!: number;
}

export class ProjectRadicationReadinessDto {
  @ApiProperty()
  ready!: boolean;

  @ApiProperty({ type: [String] })
  blockers!: string[];

  @ApiProperty({ type: RadicationScopeDto })
  scope!: RadicationScopeDto;

  @ApiProperty({ type: [RadicationScopeSemesterDto] })
  bySemester!: RadicationScopeSemesterDto[];

  @ApiProperty()
  canRegisterRadication!: boolean;

  @ApiProperty()
  canResubmitRadication!: boolean;

  @ApiProperty({ enum: ProjectInstitutionalState, nullable: true })
  projectInstitutionalState!: ProjectInstitutionalState | null;

  @ApiProperty({ nullable: true })
  institutionalScopeLockedAt!: Date | null;

  @ApiProperty({ nullable: true })
  radicationNumber!: string | null;

  @ApiProperty({ nullable: true })
  radicatedAt!: Date | null;

  @ApiProperty({ nullable: true })
  lastRadicationReturnReason!: string | null;

  @ApiProperty({ nullable: true })
  productRadicationDueAt!: Date | null;

  @ApiProperty({ nullable: true })
  planningRadicationCheckDueAt!: Date | null;
}
