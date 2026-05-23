import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddTopicsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  topics!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  changeReason?: string;
}
