import { ApiProperty } from '@nestjs/swagger';

export class ReportFilterOptionDto {
  @ApiProperty()
  value!: string;

  @ApiProperty()
  label!: string;
}

export class ReportRadicatedProgramOptionDto {
  @ApiProperty()
  projectId!: string;

  @ApiProperty()
  program!: string;

  @ApiProperty()
  school!: string;

  @ApiProperty()
  radicationNumber!: string;

  @ApiProperty()
  label!: string;
}

export class ReportFilterOptionsDto {
  @ApiProperty()
  reportId!: string;

  @ApiProperty({ type: [ReportFilterOptionDto] })
  schools!: ReportFilterOptionDto[];

  @ApiProperty({ type: [ReportFilterOptionDto], required: false })
  modalities?: ReportFilterOptionDto[];

  @ApiProperty({ type: [ReportFilterOptionDto], required: false })
  priorities?: ReportFilterOptionDto[];

  @ApiProperty({ type: [ReportFilterOptionDto], required: false })
  slaStatuses?: ReportFilterOptionDto[];

  @ApiProperty({ type: [ReportFilterOptionDto], required: false })
  projectStatuses?: ReportFilterOptionDto[];

  @ApiProperty({ type: [ReportFilterOptionDto], required: false })
  institutionalStates?: ReportFilterOptionDto[];

  @ApiProperty({ type: [ReportFilterOptionDto], required: false })
  operationalStates?: ReportFilterOptionDto[];

  @ApiProperty({ type: [ReportFilterOptionDto], required: false })
  observationStatuses?: ReportFilterOptionDto[];

  @ApiProperty({ type: [ReportFilterOptionDto], required: false })
  factoryProductionStatuses?: ReportFilterOptionDto[];

  @ApiProperty({ type: [ReportFilterOptionDto], required: false })
  radicationStatuses?: ReportFilterOptionDto[];

  @ApiProperty({ type: [ReportFilterOptionDto], required: false })
  hasRadicationOptions?: ReportFilterOptionDto[];

  @ApiProperty({ type: [ReportRadicatedProgramOptionDto], required: false })
  radicatedPrograms?: ReportRadicatedProgramOptionDto[];
}
