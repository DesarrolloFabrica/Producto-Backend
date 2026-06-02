import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
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
import { NotifyCorrectionsDto } from './dto/notify-corrections.dto';
import { ReopenObservationDto } from './dto/reopen-observation.dto';
import {
  ObservationMessageResponseDto,
  ObservationResponseDto,
} from './dto/observation-response.dto';
import { UpdateObservationStatusResponseDto } from './dto/update-observation-status-response.dto';
import { ObservationBatchResponseDto } from './dto/observation-batch-response.dto';
import { ObservationsService } from './observations.service';
import { ObservationBatchesService } from './observation-batches.service';

@ApiTags('observations')
@ApiBearerAuth('bearer')
@Controller()
@UseGuards(JwtAuthGuard)
export class ObservationsController {
  constructor(
    private readonly observationsService: ObservationsService,
    private readonly observationBatchesService: ObservationBatchesService,
  ) {}

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

  @Post('observations/:id/reopen')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Reabrir observación corregida o validada (EN_CORRECCION/RESUELTA → ABIERTA)' })
  @ApiOkResponse({ type: UpdateObservationStatusResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenObservationDto,
    @CurrentUser() user: UserEntity,
  ): Promise<UpdateObservationStatusResponseDto> {
    return await this.observationsService.reopen(id, dto.reason, user);
  }

  @Delete('observations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar borrador de observación de Product (aún no enviado a Fábrica)' })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async deleteDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    await this.observationsService.deleteDraft(id, user);
  }

  @Post('subjects/:subjectId/observation-batches/send-to-factory')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Enviar observaciones pendientes a Fábrica (lote)' })
  @ApiOkResponse({ type: ObservationBatchResponseDto })
  async sendObservationsToFactory(
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ObservationBatchResponseDto> {
    return await this.observationBatchesService.sendObservationsToFactory(subjectId, user);
  }

  @Post('subjects/:subjectId/observation-batches/notify-corrections')
  @UseGuards(RolesGuard)
  @Roles(UserRole.FABRICA, UserRole.ADMIN)
  @ApiOperation({ summary: 'Notificar correcciones realizadas a Product (lote)' })
  @ApiOkResponse({ type: ObservationBatchResponseDto })
  async notifyCorrectionsToProduct(
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Body() dto: NotifyCorrectionsDto,
    @CurrentUser() user: UserEntity,
  ): Promise<ObservationBatchResponseDto> {
    return await this.observationBatchesService.notifyCorrectionsToProduct(
      subjectId,
      user,
      dto.observationIds,
    );
  }

  @Post('semesters/:semesterId/observation-batches/send-to-factory')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Enviar observaciones pendientes del semestre a Fabrica (lote)' })
  @ApiOkResponse({ type: ObservationBatchResponseDto })
  async sendSemesterObservationsToFactory(
    @Param('semesterId', ParseUUIDPipe) semesterId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ObservationBatchResponseDto> {
    return await this.observationBatchesService.sendSemesterObservationsToFactory(semesterId, user);
  }

  @Post('semesters/:semesterId/observation-batches/notify-corrections')
  @UseGuards(RolesGuard)
  @Roles(UserRole.FABRICA, UserRole.ADMIN)
  @ApiOperation({ summary: 'Notificar correcciones realizadas del semestre a Product (lote)' })
  @ApiOkResponse({ type: ObservationBatchResponseDto })
  async notifySemesterCorrectionsToProduct(
    @Param('semesterId', ParseUUIDPipe) semesterId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ObservationBatchResponseDto> {
    return await this.observationBatchesService.notifySemesterCorrectionsToProduct(semesterId, user);
  }
}
