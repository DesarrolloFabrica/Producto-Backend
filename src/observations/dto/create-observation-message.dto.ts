import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateObservationMessageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  message!: string;
}
