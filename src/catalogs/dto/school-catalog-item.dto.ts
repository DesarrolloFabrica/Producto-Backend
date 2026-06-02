import { ApiProperty } from '@nestjs/swagger';

export class SchoolCatalogItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Ingenierías' })
  name!: string;
}
