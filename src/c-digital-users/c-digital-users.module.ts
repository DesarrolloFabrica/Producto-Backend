import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CDigitalUserEntity } from './c-digital-user.entity';
import { CDigitalUsersController } from './c-digital-users.controller';
import { CDigitalUsersCrypto } from './c-digital-users.crypto';
import { CDigitalUsersService } from './c-digital-users.service';

@Module({
  imports: [TypeOrmModule.forFeature([CDigitalUserEntity]), AuthModule],
  controllers: [CDigitalUsersController],
  providers: [CDigitalUsersService, CDigitalUsersCrypto],
})
export class CDigitalUsersModule {}
