import { ApiProperty } from '@nestjs/swagger';

export class BulkApproveSectionResponseDto {
  @ApiProperty()
  countUpdated!: number;

  @ApiProperty()
  subjectId!: string;

  @ApiProperty()
  projectId!: string;

  @ApiProperty()
  alreadyApproved!: boolean;

  @ApiProperty({ type: [String] })
  updatedItemIds!: string[];

  @ApiProperty({ required: false })
  subjectProgress?: number;

  @ApiProperty({ required: false })
  projectProgress?: number;
}
