import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
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
import { UserEntity } from '../users/user.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectDetailDto, ProjectListItemDto } from './dto/project-response.dto';
import { AddSemesterDto } from '../semesters/dto/add-semester.dto';
import { ObservationResponseDto } from '../observations/dto/observation-response.dto';
import { ObservationsService } from '../observations/observations.service';
import { ProjectActionResponseDto } from './dto/project-action-response.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth('bearer')
@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly observationsService: ObservationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar proyectos según rol del usuario' })
  @ApiOkResponse({ type: ProjectListItemDto, isArray: true })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  async findAll(@CurrentUser() user: UserEntity): Promise<ProjectListItemDto[]> {
    return await this.projectsService.findAll(user);
  }

  @Get(':projectId/observations')
  @ApiOperation({ summary: 'Listar observaciones de un proyecto' })
  @ApiOkResponse({ type: ObservationResponseDto, isArray: true })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async findObservations(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ObservationResponseDto[]> {
    return await this.observationsService.findByProject(projectId, user);
  }

  @Post(':id/mark-delivered')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Marcar proyecto como entregado (entrega final administrativa)' })
  @ApiOkResponse({ type: ProjectActionResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async markDelivered(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ProjectActionResponseDto> {
    return await this.projectsService.markProjectDelivered(id, user);
  }

  @Post(':id/deliver-to-lms')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  @ApiOperation({
    summary: '[Deprecated] Usar POST /projects/:id/mark-delivered',
    deprecated: true,
  })
  @ApiOkResponse({ type: ProjectActionResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async deliverToLmsDeprecated(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ProjectActionResponseDto> {
    return await this.projectsService.markProjectDelivered(id, user);
  }

  @Post(':id/close')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Cerrar proyecto (requiere entrega final previa)' })
  @ApiOkResponse({ type: ProjectActionResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ProjectActionResponseDto> {
    return await this.projectsService.closeProject(id, user);
  }

  @Post(':id/start-production')
  @UseGuards(RolesGuard)
  @Roles(UserRole.FABRICA, UserRole.ADMIN)
  @ApiOperation({ summary: 'Marcar proyecto en producción (Fábrica)' })
  @ApiOkResponse({ type: ProjectActionResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async startProduction(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ProjectActionResponseDto> {
    return await this.projectsService.startProduction(id, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle completo de un proyecto' })
  @ApiOkResponse({ type: ProjectDetailDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ProjectDetailDto> {
    return await this.projectsService.findOne(id, user);
  }

  @Post(':projectId/semesters')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Agregar semestre a un proyecto existente' })
  @ApiOkResponse({ type: ProjectDetailDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async addSemester(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: AddSemesterDto,
    @CurrentUser() user: UserEntity,
  ): Promise<ProjectDetailDto> {
    return await this.projectsService.addSemesterToProject(projectId, dto, user);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear proyecto con semestres, asignaturas, temas y checklist inicial' })
  @ApiCreatedResponse({ type: ProjectDetailDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  async create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: UserEntity,
  ): Promise<ProjectDetailDto> {
    return await this.projectsService.create(dto, user);
  }
}
