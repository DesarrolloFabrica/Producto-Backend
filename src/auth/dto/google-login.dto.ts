import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({ description: 'Google ID Token (credential from @react-oauth/google)' })
  @IsString()
  @IsNotEmpty()
  credential!: string;
}
