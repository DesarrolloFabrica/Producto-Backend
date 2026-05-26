import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterProjectRadicationDto {
  @ApiProperty({ example: 'RAD-2026-00123' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  radicationNumber!: string;

  @ApiProperty({ example: '2026-05-26T10:00:00.000Z' })
  @IsDateString()
  radicatedAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceUrl?: string;
}

export class ReturnProjectRadicationDto {
  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  returnReason!: string;
}
