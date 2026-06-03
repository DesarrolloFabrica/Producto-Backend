import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { UserEntity } from '../users/user.entity';
import { ReportingQueryDto } from './dto/reporting-query.dto';
import {
  ReportCatalogItemDto,
  ReportPreviewResponseDto,
} from './dto/reporting-response.dto';
import { ReportFilterOptionsDto } from './dto/reporting-filter-options.dto';
import { ReportSearchSuggestionDto } from './dto/reporting-search-suggestion.dto';
import { ReportId } from './report-id.enum';
import { ReportingCatalogService } from './reporting-catalog.service';
import { ReportingExportService } from './reporting-export.service';
import { ReportingFilterOptionsService } from './reporting-filter-options.service';
import { ReportingPolicyService } from './reporting-policy.service';
import { ReportingQueryService } from './reporting-query.service';
import { reportPdfExportEnabled } from './reporting.config';

const PDF_PHASE_DISABLED_MESSAGE = 'PDF temporalmente deshabilitado en esta fase.';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PRODUCT, UserRole.FABRICA, UserRole.ADMIN)
@Controller('reports')
export class ReportingController {
  constructor(
    private readonly catalogService: ReportingCatalogService,
    private readonly policyService: ReportingPolicyService,
    private readonly queryService: ReportingQueryService,
    private readonly exportService: ReportingExportService,
    private readonly filterOptionsService: ReportingFilterOptionsService,
  ) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Catálogo de reportes permitidos para el rol actual' })
  @ApiOkResponse({ type: [ReportCatalogItemDto] })
  getCatalog(@CurrentUser() user: UserEntity): ReportCatalogItemDto[] {
    return this.catalogService.getCatalogForUser(user);
  }

  @Get(':reportId/filter-options')
  @ApiOperation({ summary: 'Opciones de filtros del reporte según rol y alcance' })
  @ApiOkResponse({ type: ReportFilterOptionsDto })
  async filterOptions(
    @Param('reportId') reportId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ReportFilterOptionsDto> {
    return this.filterOptionsService.getFilterOptions(reportId as ReportId, user);
  }

  @Get(':reportId/search-suggestions')
  @ApiOperation({ summary: 'Sugerencias de búsqueda de programas/solicitudes visibles' })
  @ApiOkResponse({ type: [ReportSearchSuggestionDto] })
  async searchSuggestions(
    @Param('reportId') reportId: string,
    @Query('q') q: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ReportSearchSuggestionDto[]> {
    return this.filterOptionsService.searchSuggestions(reportId as ReportId, q ?? '', user);
  }

  @Get(':reportId/preview')
  @ApiOperation({ summary: 'Vista previa paginada del reporte' })
  @ApiOkResponse({ type: ReportPreviewResponseDto })
  async preview(
    @Param('reportId') reportId: string,
    @Query() query: ReportingQueryDto,
    @CurrentUser() user: UserEntity,
  ): Promise<ReportPreviewResponseDto> {
    const id = reportId as ReportId;
    this.policyService.assertReportAccess(id, user);
    return this.queryService.preview(id, query, user);
  }

  @Get(':reportId/export.xlsx')
  @ApiOperation({ summary: 'Exportar reporte a Excel' })
  async exportExcel(
    @Param('reportId') reportId: string,
    @Query() query: ReportingQueryDto,
    @CurrentUser() user: UserEntity,
    @Res() res: Response,
  ): Promise<void> {
    const id = reportId as ReportId;
    this.policyService.assertReportAccess(id, user);
    const result = await this.exportService.exportExcel(id, query, user);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.send(result.buffer);
  }

  @Get(':reportId/export.pdf')
  @ApiOperation({ summary: 'Exportar reporte a PDF (variantes según reporte)' })
  async exportPdf(
    @Param('reportId') reportId: string,
    @Query() query: ReportingQueryDto,
    @CurrentUser() user: UserEntity,
    @Res() res: Response,
  ): Promise<void> {
    if (!reportPdfExportEnabled()) {
      throw new BadRequestException(PDF_PHASE_DISABLED_MESSAGE);
    }
    const id = reportId as ReportId;
    this.policyService.assertReportAccess(id, user);
    this.policyService.assertPdfAccess(id, user, query);
    const result = await this.exportService.exportPdf(id, query, user, query.variant);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.send(result.buffer);
  }
}
