import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { UserEntity } from '../users/user.entity';
import { OperationalTransitionDto } from './dto/operational-transition.dto';
import {
  OperationalWorkItemDto,
  OperationalWorkspaceDto,
} from './dto/operational-workspace.dto';
import { InstitutionalWorkflowService } from './institutional-workflow.service';
import {
  SemesterOperationalWorkflowService,
  SemesterOperationalWorkspaceDto,
  SemesterOperationalWorkItemDto,
} from './semester-operational-workflow.service';

@ApiTags('institutional-workflow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class InstitutionalWorkflowController {
  constructor(
    private readonly workflowService: InstitutionalWorkflowService,
    private readonly semesterWorkflowService: SemesterOperationalWorkflowService,
  ) {}

  @Post('subjects/:subjectId/operational-transitions')
  @Roles(
    UserRole.PRODUCT,
    UserRole.FABRICA,
    UserRole.PLANEACION,
    UserRole.LMS,
    UserRole.ADMIN,
  )
  async transition(
    @Param('subjectId') subjectId: string,
    @Body() dto: OperationalTransitionDto,
    @CurrentUser() user: UserEntity,
  ): Promise<OperationalWorkspaceDto> {
    return this.workflowService.transition(subjectId, dto, user);
  }

  @Get('subjects/:subjectId/operational-workspace')
  @Roles(
    UserRole.PRODUCT,
    UserRole.FABRICA,
    UserRole.PLANEACION,
    UserRole.LMS,
    UserRole.ADMIN,
  )
  async workspace(
    @Param('subjectId') subjectId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<OperationalWorkspaceDto> {
    return this.workflowService.getWorkspace(subjectId, user);
  }

  @Post('semesters/:semesterId/operational-transitions')
  @Roles(
    UserRole.PRODUCT,
    UserRole.FABRICA,
    UserRole.PLANEACION,
    UserRole.LMS,
    UserRole.ADMIN,
  )
  async semesterTransition(
    @Param('semesterId') semesterId: string,
    @Body() dto: OperationalTransitionDto,
    @CurrentUser() user: UserEntity,
  ): Promise<SemesterOperationalWorkspaceDto> {
    return this.semesterWorkflowService.transition(semesterId, dto, user);
  }

  @Get('semesters/:semesterId/operational-workspace')
  @Roles(
    UserRole.PRODUCT,
    UserRole.FABRICA,
    UserRole.PLANEACION,
    UserRole.LMS,
    UserRole.ADMIN,
  )
  async semesterWorkspace(
    @Param('semesterId') semesterId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<SemesterOperationalWorkspaceDto> {
    return this.semesterWorkflowService.getWorkspace(semesterId, user);
  }

  @Get('planning/work')
  @Roles(UserRole.PLANEACION, UserRole.ADMIN)
  async planningWork(@CurrentUser() user: UserEntity): Promise<SemesterOperationalWorkItemDto[]> {
    return this.semesterWorkflowService.listWorkForRole(user);
  }

  @Get('lms/work')
  @Roles(UserRole.LMS, UserRole.ADMIN)
  async lmsWork(@CurrentUser() user: UserEntity): Promise<SemesterOperationalWorkItemDto[]> {
    return this.semesterWorkflowService.listWorkForRole(user);
  }

  @Get('product/operational-work')
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  async productOperationalWork(
    @CurrentUser() user: UserEntity,
  ): Promise<SemesterOperationalWorkItemDto[]> {
    return this.semesterWorkflowService.listWorkForRole(user);
  }

  @Get('factory/operational-work')
  @Roles(UserRole.FABRICA, UserRole.ADMIN)
  async factoryOperationalWork(
    @CurrentUser() user: UserEntity,
  ): Promise<SemesterOperationalWorkItemDto[]> {
    return this.semesterWorkflowService.listWorkForRole(user);
  }
}
