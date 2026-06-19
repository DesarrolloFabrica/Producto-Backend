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
  password!: string;

  @ApiProperty({ type: CDigitalUserAuditUserDto })
  createdBy!: CDigitalUserAuditUserDto;

  @ApiPropertyOptional({ type: CDigitalUserAuditUserDto })
  updatedBy!: CDigitalUserAuditUserDto | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
