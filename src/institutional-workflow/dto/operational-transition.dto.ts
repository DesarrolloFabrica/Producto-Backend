import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUrl, MinLength, ValidateIf } from 'class-validator';
import { InstitutionalOperationalAction } from '../../common/enums/institutional-operational-action.enum';

export class OperationalTransitionDto {
  @ApiProperty({ enum: InstitutionalOperationalAction })
  @IsEnum(InstitutionalOperationalAction)
  action!: InstitutionalOperationalAction;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @ValidateIf((o) => isReturnAction(o.action))
  @MinLength(10, { message: 'El motivo de devolución debe tener al menos 10 caracteres' })
  comment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  returnReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({}, { message: 'evidenceUrl debe ser una URL válida' })
  evidenceUrl?: string;
}

function isReturnAction(action: InstitutionalOperationalAction): boolean {
  return (
    action === InstitutionalOperationalAction.PLANNING_RETURN_INITIAL ||
    action === InstitutionalOperationalAction.PLANNING_RETURN_PRODUCTION ||
    action === InstitutionalOperationalAction.PLANNING_RETURN_LMS
  );
}
