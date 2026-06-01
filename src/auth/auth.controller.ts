import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserEntity } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { AuthService } from './auth.service';
import { DevEmailLoginDto } from './dto/dev-email-login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('login')
  @ApiOkResponse({
    schema: {
      example: {
        accessToken: '...jwt...',
        user: { id: 'uuid', name: 'Admin', email: 'admin@local', role: 'ADMIN' },
      },
    },
  })
  async login(@Body() dto: LoginDto) {
    return await this.authService.login(dto.email, dto.password);
  }

  @Post('google')
  @ApiOkResponse({
    schema: {
      example: {
        accessToken: '...jwt...',
        user: { id: 'uuid', name: 'Admin', email: 'admin@cun.edu.co', role: 'ADMIN' },
        role: 'ADMIN',
      },
    },
  })
  async loginWithGoogle(@Body() dto: GoogleLoginDto) {
    return await this.authService.loginWithGoogle(dto.credential);
  }

  @Post('dev/email')
  @ApiOkResponse({
    schema: {
      example: {
        accessToken: '...jwt...',
        user: { id: 'uuid', name: 'Usuario', email: 'usuario@cun.edu.co', role: 'PRODUCT' },
        role: 'PRODUCT',
      },
    },
  })
  async loginWithDevEmail(@Body() dto: DevEmailLoginDto) {
    return await this.authService.loginWithDevEmail(dto.email);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOkResponse({ type: UserResponseDto })
  me(@CurrentUser() user: UserEntity): UserResponseDto {
    return this.usersService.toSafeUser(user);
  }
}
