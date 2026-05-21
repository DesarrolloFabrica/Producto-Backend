import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
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
import { CreateObservationMessageDto } from './dto/create-observation-message.dto';
import { CreateObservationDto } from './dto/create-observation.dto';
import {
  ObservationMessageResponseDto,
  ObservationResponseDto,
} from './dto/observation-response.dto';
import { UpdateObservationStatusResponseDto } from './dto/update-observation-status-response.dto';
import { ObservationsService } from './observations.service';

@ApiTags('observations')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(JwtAuthGuard)
export class ObservationsController {
  constructor(private readonly observationsService: ObservationsService) {}

  @Post('observations')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRODUCT, UserRole.FABRICA, UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear observación (status inicial ABIERTA)' })
  @ApiCreatedResponse({ type: ObservationResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  async create(
    @Body() dto: CreateObservationDto,
    @CurrentUser() user: UserEntity,
  ): Promise<ObservationResponseDto> {
    return await this.observationsService.create(dto, user);
  }

  @Get('subjects/:subjectId/observations')
  @ApiOperation({ summary: 'Listar observaciones de una asignatura' })
  @ApiOkResponse({ type: ObservationResponseDto, isArray: true })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async findBySubject(
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ObservationResponseDto[]> {
    return await this.observationsService.findBySubject(subjectId, user);
  }

  @Post('observations/:id/messages')
  @ApiOperation({ summary: 'Agregar mensaje a una observación' })
  @ApiCreatedResponse({ type: ObservationMessageResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async addMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateObservationMessageDto,
    @CurrentUser() user: UserEntity,
  ): Promise<ObservationMessageResponseDto> {
    return await this.observationsService.addMessage(id, dto, user);
  }

  @Post('observations/:id/mark-correction-applied')
  @UseGuards(RolesGuard)
  @Roles(UserRole.FABRICA, UserRole.ADMIN)
  @ApiOperation({ summary: 'Marcar corrección aplicada (ABIERTA → EN_CORRECCION)' })
  @ApiOkResponse({ type: UpdateObservationStatusResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async markCorrectionApplied(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ): Promise<UpdateObservationStatusResponseDto> {
    return await this.observationsService.markCorrectionApplied(id, user);
  }

  @Post('observations/:id/validate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Validar observación corregida (EN_CORRECCION → RESUELTA)' })
  @ApiOkResponse({ type: UpdateObservationStatusResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async validate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ): Promise<UpdateObservationStatusResponseDto> {
    return await this.observationsService.validate(id, user);
  }
}
