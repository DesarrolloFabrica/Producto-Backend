import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { AuditService } from './audit.service';
import { AuditLogListResponseDto } from './dto/audit-log-response.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @ApiOperation({ summary: 'Listado institucional de auditoría (solo ADMIN)' })
  @ApiOkResponse({ type: AuditLogListResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  findLogs(@Query() query: AuditLogQueryDto): Promise<AuditLogListResponseDto> {
    return this.auditService.findLogs(query);
  }
}
