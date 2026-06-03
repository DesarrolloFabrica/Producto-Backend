import { ApiProperty } from '@nestjs/swagger';

export class ReportSearchSuggestionDto {
  @ApiProperty()
  projectId!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  subtitle!: string;

  @ApiProperty({ required: false })
  radicationNumber?: string;

  @ApiProperty()
  hasRadication!: boolean;
}
