import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
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
import {
  EmailDeliveryLogListResponseDto,
  EmailDeliveryLogQueryDto,
  SendMailResultDto,
} from './dto/email-delivery-log.dto';
import { TestEmailDto } from './dto/test-email.dto';
import { EmailService } from './email.service';
import { buildSimpleTestEmail } from './templates/institutional-notification.template';

@ApiTags('email')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('test')
  @ApiOperation({ summary: 'Envío de correo de prueba (solo ADMIN)' })
  @ApiOkResponse({ type: SendMailResultDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  async sendTestEmail(@Body() dto: TestEmailDto): Promise<SendMailResultDto> {
    const blockReason = this.emailService.getTestModeBlockReason();
    if (blockReason) {
      throw new UnprocessableEntityException(blockReason);
    }

    const { html, text } = buildSimpleTestEmail(dto.message);
    const result = await this.emailService.sendMail({
      to: dto.to,
      subject: dto.subject,
      html,
      text,
      metadata: { eventType: 'EMAIL_TEST' },
      throwOnError: true,
    });
    return this.emailService.toSendMailResultDto(result);
  }

  @Get('delivery-logs')
  @ApiOperation({ summary: 'Últimos intentos de envío de correo (solo ADMIN, QA)' })
  @ApiOkResponse({ type: EmailDeliveryLogListResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  findDeliveryLogs(@Query() query: EmailDeliveryLogQueryDto): Promise<EmailDeliveryLogListResponseDto> {
    return this.emailService.findDeliveryLogs(query.limit ?? 20);
  }
}
