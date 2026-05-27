import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateTopicDto {
  @ApiProperty({ example: 'Introducción al curso' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
