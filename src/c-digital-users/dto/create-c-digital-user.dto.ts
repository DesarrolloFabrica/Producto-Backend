import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCDigitalUserDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(220)
  programName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(220)
  username!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  password!: string;
}
