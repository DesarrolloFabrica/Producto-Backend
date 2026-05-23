import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';

import {

  ApiBearerAuth,

  ApiForbiddenResponse,

  ApiNotFoundResponse,

  ApiOkResponse,

  ApiOperation,

  ApiTags,

  ApiUnauthorizedResponse,

} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { UserEntity } from '../users/user.entity';

import {

  NotificationInboxQueryDto,

  NotificationInboxResponseDto,

  NotificationSummaryDto,

} from './dto/notification-inbox.dto';

import { MarkAllReadResponseDto, NotificationResponseDto } from './dto/notification-response.dto';

import {

  MarkReadByResourceDto,

  MarkReadByResourceResponseDto,

} from './dto/mark-read-by-resource.dto';

import {
  DismissNotificationsDto,
  DismissNotificationsResponseDto,
} from './dto/dismiss-notifications.dto';

import { NotificationsService } from './notifications.service';



@ApiTags('notifications')

@ApiBearerAuth('bearer')

@Controller('notifications')

@UseGuards(JwtAuthGuard)

export class NotificationsController {

  constructor(private readonly notificationsService: NotificationsService) {}



  @Get()

  @ApiOperation({ summary: 'Bandeja de notificaciones con retención y paginación' })

  @ApiOkResponse({ type: NotificationInboxResponseDto })

  @ApiUnauthorizedResponse()

  async findAll(

    @CurrentUser() user: UserEntity,

    @Query() query: NotificationInboxQueryDto,

  ): Promise<NotificationInboxResponseDto> {

    return await this.notificationsService.findInbox(user, query);

  }



  @Get('summary')

  @ApiOperation({ summary: 'Resumen de alertas accionables para badge' })

  @ApiOkResponse({ type: NotificationSummaryDto })

  @ApiUnauthorizedResponse()

  async getSummary(@CurrentUser() user: UserEntity): Promise<NotificationSummaryDto> {

    return await this.notificationsService.getSummary(user);

  }



  @Patch('dismiss-informative')

  @ApiOperation({ summary: 'Archivar automáticamente notificaciones informativas sin leer' })

  @ApiOkResponse({ type: MarkAllReadResponseDto })

  @ApiUnauthorizedResponse()

  async dismissInformative(@CurrentUser() user: UserEntity): Promise<MarkAllReadResponseDto> {

    const updatedCount = await this.notificationsService.dismissInformative(user);

    return { updatedCount };

  }



  @Patch('dismiss')

  @ApiOperation({ summary: 'Descartar notificaciones seleccionadas o de un recurso' })

  @ApiOkResponse({ type: DismissNotificationsResponseDto })

  @ApiUnauthorizedResponse()

  async dismissNotifications(

    @CurrentUser() user: UserEntity,

    @Body() dto: DismissNotificationsDto,

  ): Promise<DismissNotificationsResponseDto> {

    const updatedCount = await this.notificationsService.dismissNotifications(user, dto);

    return { updatedCount };

  }



  @Patch('read-all')

  @ApiOperation({ summary: 'Marcar todas las notificaciones como leídas' })

  @ApiOkResponse({ type: MarkAllReadResponseDto })

  @ApiUnauthorizedResponse()

  async markAllRead(@CurrentUser() user: UserEntity): Promise<MarkAllReadResponseDto> {

    const updatedCount = await this.notificationsService.markAllRead(user);

    return { updatedCount };

  }



  @Patch('read-by-resource')

  @ApiOperation({ summary: 'Marcar como leídas las notificaciones de un recurso' })

  @ApiOkResponse({ type: MarkReadByResourceResponseDto })

  @ApiUnauthorizedResponse()

  async markReadByResource(

    @CurrentUser() user: UserEntity,

    @Body() dto: MarkReadByResourceDto,

  ): Promise<MarkReadByResourceResponseDto> {

    const updatedCount = await this.notificationsService.markReadByResource(user, dto);

    return { updatedCount };

  }



  @Patch(':id/dismiss')

  @ApiOperation({ summary: 'Descartar una notificación' })

  @ApiOkResponse({ type: NotificationResponseDto })

  @ApiUnauthorizedResponse()

  @ApiForbiddenResponse()

  @ApiNotFoundResponse()

  async dismissOne(

    @Param('id', ParseUUIDPipe) id: string,

    @CurrentUser() user: UserEntity,

  ): Promise<NotificationResponseDto> {

    return await this.notificationsService.dismissNotification(id, user);

  }



  @Patch(':id/read')

  @ApiOperation({ summary: 'Marcar una notificación como leída' })

  @ApiOkResponse({ type: NotificationResponseDto })

  @ApiUnauthorizedResponse()

  @ApiForbiddenResponse()

  @ApiNotFoundResponse()

  async markRead(

    @Param('id', ParseUUIDPipe) id: string,

    @CurrentUser() user: UserEntity,

  ): Promise<NotificationResponseDto> {

    return await this.notificationsService.markRead(id, user);

  }

}


