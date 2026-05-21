import { ApiProperty } from '@nestjs/swagger';
import { ChecklistStatus } from '../../common/enums/checklist-status.enum';
import { ProjectStatus } from '../../common/enums/project-status.enum';
import { SubjectStatus } from '../../common/enums/subject-status.enum';
import { SemesterStatus } from '../../common/enums/semester-status.enum';

export class ChecklistStatusUpdateResponseDto {
  @ApiProperty({ format: 'uuid' })
  checklistItemId!: string;

  @ApiProperty({ enum: ChecklistStatus })
  checklistStatus!: ChecklistStatus;

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
