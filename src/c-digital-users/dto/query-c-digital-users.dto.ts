import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class QueryCDigitalUsersDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

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
