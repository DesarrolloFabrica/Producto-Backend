import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { RejectSubjectDto } from './dto/reject-subject.dto';
import { SubmitSubjectResponseDto } from './dto/submit-subject-response.dto';
import { SubjectsService } from './subjects.service';

@ApiTags('subjects')
@ApiBearerAuth('bearer')
@Controller('subjects')
@UseGuards(JwtAuthGuard)
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post(':id/submit')
  @UseGuards(RolesGuard)
  @Roles(UserRole.FABRICA, UserRole.ADMIN)
  @ApiOperation({ summary: 'Enviar asignatura a revisión (IN_REVIEW)' })
  @ApiOkResponse({ type: SubmitSubjectResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ): Promise<SubmitSubjectResponseDto> {
    return await this.subjectsService.submit(id, user);
  }

  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Aprobar asignatura (todos los checklist APROBADO, sin bloqueantes)' })
  @ApiOkResponse({ type: SubmitSubjectResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ): Promise<SubmitSubjectResponseDto> {
    return await this.subjectsService.approve(id, user);
  }

  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Rechazar asignatura (no crea observación automática)' })
  @ApiOkResponse({ type: SubmitSubjectResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectSubjectDto,
    @CurrentUser() user: UserEntity,
  ): Promise<SubmitSubjectResponseDto> {
    return await this.subjectsService.reject(id, dto, user);
  }
}
