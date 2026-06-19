import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryCDigitalUsersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(220)
  programName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(220)
  username?: string;

  @ApiPropertyOptional({ description: 'Fecha de creación YYYY-MM-DD' })
  @IsOptional()
  @IsISO8601({ strict: false })
  createdAt?: string;

  @ApiPropertyOptional({ enum: ['recent', 'oldest'] })
  @IsOptional()
  @IsIn(['recent', 'oldest'])
  order?: 'recent' | 'oldest';
}
