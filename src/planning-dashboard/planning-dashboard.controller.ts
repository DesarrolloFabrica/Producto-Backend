import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { UserEntity } from '../users/user.entity';
import { PlanningDashboardSummaryDto } from './dto/planning-dashboard-summary.dto';
import { PlanningDashboardService } from './planning-dashboard.service';

@ApiTags('planning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('planning')
export class PlanningDashboardController {
  constructor(private readonly planningDashboardService: PlanningDashboardService) {}

  @Get('dashboard-summary')
  @Roles(UserRole.PLANEACION, UserRole.ADMIN)
  @ApiOkResponse({ type: PlanningDashboardSummaryDto })
  async dashboardSummary(@CurrentUser() user: UserEntity): Promise<PlanningDashboardSummaryDto> {
    return this.planningDashboardService.getSummary(user);
  }
}
