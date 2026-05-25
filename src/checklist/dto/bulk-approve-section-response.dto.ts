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
}
