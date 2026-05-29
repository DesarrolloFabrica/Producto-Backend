import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../common/enums/user-role.enum';

export class AuditLogDetailEntryDto {
  @ApiProperty()
  label!: string;

  @ApiProperty()
  value!: string;
}

export class AuditLogResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  entityType!: string;

  @ApiProperty()
  entityId!: string;

  @ApiProperty()
  entityName!: string;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  userName!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty()
  previousValue!: string;

  @ApiProperty()
  newValue!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiPropertyOptional()
  projectId?: string;

  @ApiPropertyOptional()
  subjectId?: string;

  @ApiPropertyOptional()
  semesterId?: string;

  @ApiPropertyOptional()
  program?: string;

  @ApiPropertyOptional()
  school?: string;

  @ApiPropertyOptional()
  semesterNumber?: number;

  @ApiPropertyOptional()
  subjectName?: string;

  @ApiPropertyOptional()
  entityTypeLabel?: string;

  @ApiPropertyOptional()
  roleLabel?: string;

  @ApiProperty()
  summary!: string;

  @ApiProperty()
  changeLabel!: string;

  @ApiProperty()
  scope!: string;

  @ApiProperty({ type: [AuditLogDetailEntryDto] })
  details!: AuditLogDetailEntryDto[];
}

export class AuditLogStatsDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  productCount!: number;

  @ApiProperty()
  factoryCount!: number;

  @ApiProperty()
  checklistCount!: number;
}

export class AuditLogListResponseDto {
  @ApiProperty({ type: [AuditLogResponseDto] })
  items!: AuditLogResponseDto[];

  @ApiProperty()
  hasMore!: boolean;

  @ApiProperty()
  total!: number;

  @ApiProperty({ type: AuditLogStatsDto })
  stats!: AuditLogStatsDto;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  totalPages!: number;
}
