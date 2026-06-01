import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class TestEmailDto {
  @IsEmail()
  to!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message!: string;
}
