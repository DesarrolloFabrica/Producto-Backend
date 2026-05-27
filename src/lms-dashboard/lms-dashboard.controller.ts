import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { UserEntity } from '../users/user.entity';
import { LmsDashboardSummaryDto } from './dto/lms-dashboard-summary.dto';
import { LmsDashboardService } from './lms-dashboard.service';

@ApiTags('lms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('lms')
export class LmsDashboardController {
  constructor(private readonly lmsDashboardService: LmsDashboardService) {}

  @Get('dashboard-summary')
  @Roles(UserRole.LMS, UserRole.ADMIN)
  @ApiOkResponse({ type: LmsDashboardSummaryDto })
  async dashboardSummary(@CurrentUser() user: UserEntity): Promise<LmsDashboardSummaryDto> {
    return this.lmsDashboardService.getSummary(user);
  }
}
