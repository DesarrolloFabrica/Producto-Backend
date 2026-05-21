import { ApiProperty } from '@nestjs/swagger';
import { ProjectStatus } from '../../common/enums/project-status.enum';

export class ProjectActionResponseDto {
  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ enum: ProjectStatus })
  projectStatus!: ProjectStatus;

  @ApiProperty()
  projectProgress!: number;
}
