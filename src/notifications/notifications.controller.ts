import { Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
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
import { MarkAllReadResponseDto, NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth('bearer')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar notificaciones del usuario y de su rol' })
  @ApiOkResponse({ type: NotificationResponseDto, isArray: true })
  @ApiUnauthorizedResponse()
  async findAll(@CurrentUser() user: UserEntity): Promise<NotificationResponseDto[]> {
    return await this.notificationsService.findForUser(user);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Marcar todas las notificaciones como leídas' })
  @ApiOkResponse({ type: MarkAllReadResponseDto })
  @ApiUnauthorizedResponse()
  async markAllRead(@CurrentUser() user: UserEntity): Promise<MarkAllReadResponseDto> {
    const updatedCount = await this.notificationsService.markAllRead(user);
    return { updatedCount };
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
