import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '../common/enums/user-role.enum';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ProjectDetailDto } from '../projects/dto/project-response.dto';
import { UserEntity } from '../users/user.entity';
import {
  FactoryDashboardSummaryDto,
  FactorySubjectsQueryDto,
} from './dto/factory-dashboard-summary.dto';
import { FactorySubjectsPageDto } from './dto/factory-subject-work-item.dto';
import { FactoryDashboardService } from './factory-dashboard.service';

@ApiTags('factory')
@ApiBearerAuth('bearer')
@Controller('factory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FABRICA, UserRole.ADMIN)
export class FactoryDashboardController {
  constructor(private readonly factoryDashboardService: FactoryDashboardService) {}

  @Get('dashboard/summary')
  @ApiOperation({ summary: 'Resumen operacional del dashboard de Fábrica' })
  @ApiOkResponse({ type: FactoryDashboardSummaryDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  async getSummary(@CurrentUser() user: UserEntity): Promise<FactoryDashboardSummaryDto> {
    return this.factoryDashboardService.getSummary(user);
  }

  @Get('subjects')
  @ApiOperation({ summary: 'Listado paginado de work items por asignatura' })
  @ApiOkResponse({ type: FactorySubjectsPageDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  async listSubjects(
    @CurrentUser() user: UserEntity,
    @Query() query: FactorySubjectsQueryDto,
  ): Promise<FactorySubjectsPageDto> {
    return this.factoryDashboardService.listSubjects(user, query);
  }

  @Get('subjects/:id/detail')
  @ApiOperation({ summary: 'Detalle profundo de asignatura para Fábrica' })
  @ApiOkResponse({ type: ProjectDetailDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  async getSubjectDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ProjectDetailDto> {
    return this.factoryDashboardService.getSubjectDetail(id, user);
  }
}
