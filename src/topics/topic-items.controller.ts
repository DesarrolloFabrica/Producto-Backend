import { Body, Controller, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
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
import { SubjectWorkspaceDto } from '../subjects/dto/subject-workspace.dto';
import { SubjectsService } from '../subjects/subjects.service';
import { UpdateTopicDto } from './dto/update-topic.dto';

@ApiTags('topics')
@ApiBearerAuth('bearer')
@Controller('topics')
@UseGuards(JwtAuthGuard)
export class TopicItemsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Patch(':topicId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Renombrar gránulo durante revisión académica' })
  @ApiOkResponse({ type: SubjectWorkspaceDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async updateTopic(
    @Param('topicId', ParseUUIDPipe) topicId: string,
    @Body() dto: UpdateTopicDto,
    @CurrentUser() user: UserEntity,
  ): Promise<SubjectWorkspaceDto> {
    return await this.subjectsService.updateTopicName(topicId, dto.name, user);
  }
}
