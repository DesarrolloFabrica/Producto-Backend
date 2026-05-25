import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProjectRecentChangesDto {
  @ApiProperty()
  semestersAdded!: number;

  @ApiProperty()
  subjectsAdded!: number;
}

export class ProjectChangeTimelineEntryDto {
  @ApiProperty()
  occurredAt!: Date;

  @ApiProperty()
  label!: string;

  @ApiProperty({ enum: ['PROJECT_CREATED', 'SEMESTER_ADDED', 'SUBJECT_ADDED'] })
  kind!: 'PROJECT_CREATED' | 'SEMESTER_ADDED' | 'SUBJECT_ADDED';

  @ApiPropertyOptional({ nullable: true })
  semesterNumber?: number | null;

  @ApiPropertyOptional({ nullable: true })
  subjectName?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  subjectId?: string | null;

  @ApiPropertyOptional()
  actionUrl?: string;
}
