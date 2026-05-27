import { ApiProperty } from '@nestjs/swagger';
import { ObservationBatchType } from '../../common/enums/observation-batch-type.enum';

export class ObservationBatchResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  subjectId!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ enum: ObservationBatchType })
  type!: ObservationBatchType;

  @ApiProperty()
  observationCount!: number;

  @ApiProperty()
  sentAt!: Date;
}
