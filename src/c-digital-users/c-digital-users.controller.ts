import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PRODUCTO_C_DIGITAL_USERS_ACCESS } from '../common/permissions';
import { UserEntity } from '../users/user.entity';
import { CDigitalUsersService } from './c-digital-users.service';
import { CDigitalUserResponseDto } from './dto/c-digital-user-response.dto';
import { CreateCDigitalUserDto } from './dto/create-c-digital-user.dto';
import { QueryCDigitalUsersDto } from './dto/query-c-digital-users.dto';
import { UpdateCDigitalUserDto } from './dto/update-c-digital-user.dto';

@ApiTags('c-digital-users')
@ApiBearerAuth('bearer')
@Controller('c-digital-users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PRODUCTO_C_DIGITAL_USERS_ACCESS)
export class CDigitalUsersController {
  constructor(private readonly cDigitalUsersService: CDigitalUsersService) {}

  @Get()
  @ApiOkResponse({ type: CDigitalUserResponseDto, isArray: true })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  async findAll(@Query() query: QueryCDigitalUsersDto): Promise<CDigitalUserResponseDto[]> {
    return await this.cDigitalUsersService.findAll(query);
  }

  @Post()
  @ApiCreatedResponse({ type: CDigitalUserResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  async create(
    @Body() dto: CreateCDigitalUserDto,
    @CurrentUser() user: UserEntity,
  ): Promise<CDigitalUserResponseDto> {
    return await this.cDigitalUsersService.create(dto, user);
  }

  @Patch(':id')
  @ApiOkResponse({ type: CDigitalUserResponseDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCDigitalUserDto,
    @CurrentUser() user: UserEntity,
  ): Promise<CDigitalUserResponseDto> {
    return await this.cDigitalUsersService.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    await this.cDigitalUsersService.remove(id, user);
  }
}
