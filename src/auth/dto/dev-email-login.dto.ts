import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class DevEmailLoginDto {
  @ApiProperty({ example: 'usuario@cun.edu.co' })
  @IsEmail({ require_tld: false })
  @IsNotEmpty()
  email!: string;
}
