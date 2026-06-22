import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class CDigitalUserAuditUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;
}

export class CDigitalUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  programName!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty()
  passwordProtected!: boolean;

  @ApiProperty({ type: CDigitalUserAuditUserDto })
  createdBy!: CDigitalUserAuditUserDto;

  @ApiPropertyOptional({ type: CDigitalUserAuditUserDto })
  updatedBy!: CDigitalUserAuditUserDto | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

class PaginationMetaDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;

  @ApiProperty()
  hasNextPage!: boolean;

  @ApiProperty()
  hasPreviousPage!: boolean;
}

export class PaginatedCDigitalUsersResponseDto {
  @ApiProperty({ type: [CDigitalUserResponseDto] })
  items!: CDigitalUserResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class CDigitalUserRevealPasswordResponseDto {
  @ApiProperty()
  password!: string;
}
