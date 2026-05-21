import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '../../common/enums/project-status.enum';
import { SemesterStatus } from '../../common/enums/semester-status.enum';
import { SubjectStatus } from '../../common/enums/subject-status.enum';

export class SubmitSubjectResponseDto {
  @ApiProperty({ format: 'uuid' })
  subjectId!: string;

  @ApiProperty({ enum: SubjectStatus })
  subjectStatus!: SubjectStatus;

  @ApiProperty()
  subjectProgress!: number;

  @ApiProperty({ format: 'uuid' })
  semesterId!: string;

  @ApiProperty({ enum: SemesterStatus })
  semesterStatus!: SemesterStatus;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ enum: ProjectStatus })
  projectStatus!: ProjectStatus;

  @ApiProperty()
  projectProgress!: number;
}
