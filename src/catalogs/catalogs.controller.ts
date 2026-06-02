import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CatalogsService } from './catalogs.service';
import { SchoolCatalogItemDto } from './dto/school-catalog-item.dto';

@ApiTags('catalogs')
@ApiBearerAuth('bearer')
@Controller('catalogs')
@UseGuards(JwtAuthGuard)
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  @Get('schools')
  @ApiOperation({ summary: 'Catálogo de escuelas activas' })
  @ApiOkResponse({ type: SchoolCatalogItemDto, isArray: true })
  @ApiUnauthorizedResponse()
  listSchools(): Promise<SchoolCatalogItemDto[]> {
    return this.catalogsService.listActiveSchools();
  }
}
