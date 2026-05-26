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
import { AddSubjectDto } from '../subjects/dto/add-subject.dto';
import { ProjectDetailDto } from '../projects/dto/project-response.dto';
import { SubjectsService } from '../subjects/subjects.service';

@ApiTags('semesters')
@ApiBearerAuth('bearer')
@Controller('semesters')
@UseGuards(JwtAuthGuard)
export class SemestersController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post(':semesterId/subjects')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  @ApiOperation({
    summary: '[Deshabilitado] Agregar asignatura a semestre existente',
    deprecated: true,
    description:
      'Deshabilitado: las asignaturas solo se definen al crear la solicitud o al agregar un semestre nuevo.',
  })
  @ApiOkResponse({ type: ProjectDetailDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async addSubject(
    @Param('semesterId', ParseUUIDPipe) semesterId: string,
    @Body() dto: AddSubjectDto,
    @CurrentUser() user: UserEntity,
  ): Promise<ProjectDetailDto> {
    return await this.subjectsService.addSubjectToSemester(semesterId, dto, user);
  }
}
