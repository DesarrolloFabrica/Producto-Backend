import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../common/enums/user-role.enum';

export class ReportColumnDto {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  label!: string;
}

export class ReportCatalogItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: UserRole, isArray: true })
  allowedRoles!: UserRole[];

  @ApiProperty()
  supportsExcel!: boolean;

  @ApiProperty()
  supportsPdf!: boolean;

  @ApiProperty({ type: [String] })
  filterKeys!: string[];
}

export class ReportPreviewResponseDto {
  @ApiProperty()
  reportId!: string;

  @ApiProperty()
  generatedAt!: string;

  @ApiProperty()
  filters!: Record<string, unknown>;

  @ApiProperty({ type: [ReportColumnDto] })
  columns!: ReportColumnDto[];

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  rows!: Record<string, unknown>[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({ required: false })
  sheets?: { name: string; columns: ReportColumnDto[]; rows: Record<string, unknown>[] }[];
}
