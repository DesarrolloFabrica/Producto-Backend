import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ChecklistStatus } from '../../common/enums/checklist-status.enum';

export class UpdateChecklistStatusDto {
  @ApiProperty({ enum: ChecklistStatus, example: ChecklistStatus.EN_PRODUCCION })
  @IsEnum(ChecklistStatus)
  status!: ChecklistStatus;
}
