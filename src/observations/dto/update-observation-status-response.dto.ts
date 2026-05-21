import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ObservationStatus } from '../../common/enums/observation-status.enum';
import { ProjectStatus } from '../../common/enums/project-status.enum';
import { SemesterStatus } from '../../common/enums/semester-status.enum';
import { SubjectStatus } from '../../common/enums/subject-status.enum';
import { ObservationResponseDto } from './observation-response.dto';

export class UpdateObservationStatusResponseDto {
  @ApiProperty({ type: ObservationResponseDto })
  observation!: ObservationResponseDto;

  @ApiProperty({ enum: ObservationStatus })
  previousStatus!: ObservationStatus;

  @ApiProperty({ enum: ObservationStatus })
  currentStatus!: ObservationStatus;

  @ApiPropertyOptional()
  subjectId?: string;

  @ApiPropertyOptional({ enum: SubjectStatus })
  subjectStatus?: SubjectStatus;

  @ApiPropertyOptional()
  subjectProgress?: number;

  @ApiPropertyOptional()
  semesterId?: string;

  @ApiPropertyOptional({ enum: SemesterStatus })
  semesterStatus?: SemesterStatus;

  @ApiPropertyOptional()
  projectId?: string;

  @ApiPropertyOptional({ enum: ProjectStatus })
  projectStatus?: ProjectStatus;

  @ApiPropertyOptional()
  projectProgress?: number;
}
