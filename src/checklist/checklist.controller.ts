import { Body, Controller, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
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
import { ChecklistService } from './checklist.service';
import { BulkApproveSectionDto } from './dto/bulk-approve-section.dto';
import { BulkApproveSectionResponseDto } from './dto/bulk-approve-section-response.dto';
import { ChecklistStatusUpdateResponseDto } from './dto/checklist-status-update-response.dto';
import { UpdateChecklistStatusDto } from './dto/update-checklist-status.dto';

@ApiTags('checklist')
@ApiBearerAuth('bearer')
@Controller('checklist')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FABRICA, UserRole.PRODUCT, UserRole.ADMIN)
export class ChecklistController {
  constructor(private readonly checklistService: ChecklistService) {}

  @Post('bulk-approve-section')
  @Roles(UserRole.PRODUCT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Aprobar en bloque los ítems pendientes de una sección de checklist' })
  @ApiOkResponse({ type: BulkApproveSectionResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async bulkApproveSection(
    @Body() dto: BulkApproveSectionDto,
    @CurrentUser() user: UserEntity,
  ): Promise<BulkApproveSectionResponseDto> {
    return await this.checklistService.bulkApproveSection(dto, user);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Actualizar estado de un ítem de checklist y recalcular workflow' })
  @ApiOkResponse({ type: ChecklistStatusUpdateResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChecklistStatusDto,
    @CurrentUser() user: UserEntity,
  ): Promise<ChecklistStatusUpdateResponseDto> {
    return await this.checklistService.updateStatus(id, dto, user);
  }
}
