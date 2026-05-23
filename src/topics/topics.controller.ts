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
import { ProjectDetailDto } from '../projects/dto/project-response.dto';
import { AddTopicsDto } from './dto/add-topics.dto';
import { SubjectsService } from '../subjects/subjects.service';

@ApiTags('topics')
@ApiBearerAuth('bearer')
@Controller('subjects')
@UseGuards(JwtAuthGuard)
export class TopicsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post(':subjectId/topics')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Agregar temas a una asignatura existente' })
  @ApiOkResponse({ type: ProjectDetailDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async addTopics(
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Body() dto: AddTopicsDto,
    @CurrentUser() user: UserEntity,
  ): Promise<ProjectDetailDto> {
    return await this.subjectsService.addTopicsToSubject(subjectId, dto, user);
  }
}
