import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { UserEntity } from '../users/user.entity';
import { ProjectInstitutionalClosureDto } from './dto/project-institutional-closure.dto';
import { ProjectRadicationReadinessDto } from './dto/project-radication-readiness.dto';
import { ProjectRadicationWorkItemDto } from './dto/project-radication-work-item.dto';
import {
  RegisterProjectRadicationDto,
  ReturnProjectRadicationDto,
} from './dto/register-project-radication.dto';
import { ProjectInstitutionalWorkflowService } from './project-institutional-workflow.service';

@ApiTags('project-radication')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ProjectRadicationController {
  constructor(private readonly workflowService: ProjectInstitutionalWorkflowService) {}

  @Get('projects/:projectId/institutional-closure')
  @Roles(UserRole.PRODUCT, UserRole.PLANEACION, UserRole.LMS, UserRole.FABRICA, UserRole.ADMIN)
  async institutionalClosure(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ProjectInstitutionalClosureDto> {
    return this.workflowService.getInstitutionalClosure(projectId, user);
  }

  @Get('projects/:projectId/radication-readiness')
  @Roles(UserRole.PRODUCT, UserRole.PLANEACION, UserRole.ADMIN)
  async readiness(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ProjectRadicationReadinessDto> {
    return this.workflowService.getReadiness(projectId, user);
  }

  @Post('projects/:projectId/radication')
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  async register(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: RegisterProjectRadicationDto,
    @CurrentUser() user: UserEntity,
  ): Promise<ProjectRadicationReadinessDto> {
    return this.workflowService.registerRadication(projectId, dto, user);
  }

  @Post('projects/:projectId/radication/resubmit')
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  async resubmit(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: RegisterProjectRadicationDto,
    @CurrentUser() user: UserEntity,
  ): Promise<ProjectRadicationReadinessDto> {
    return this.workflowService.resubmitRadication(projectId, dto, user);
  }

  @Post('projects/:projectId/radication/validate')
  @Roles(UserRole.PLANEACION, UserRole.ADMIN)
  async validate(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ProjectRadicationReadinessDto> {
    return this.workflowService.validateRadication(projectId, user);
  }

  @Post('projects/:projectId/radication/return')
  @Roles(UserRole.PLANEACION, UserRole.ADMIN)
  async returnRadication(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: ReturnProjectRadicationDto,
    @CurrentUser() user: UserEntity,
  ): Promise<ProjectRadicationReadinessDto> {
    return this.workflowService.returnRadication(projectId, dto, user);
  }

  @Get('product/radication-work')
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  async productWork(@CurrentUser() user: UserEntity): Promise<ProjectRadicationWorkItemDto[]> {
    return this.workflowService.listProductRadicationWork(user);
  }

  @Get('planning/radication-work')
  @Roles(UserRole.PLANEACION, UserRole.ADMIN)
  async planningWork(@CurrentUser() user: UserEntity): Promise<ProjectRadicationWorkItemDto[]> {
    return this.workflowService.listPlanningRadicationWork(user);
  }
}
