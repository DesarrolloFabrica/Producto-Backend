import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { UserEntity } from '../users/user.entity';
import { MailService } from './mail.service';

@Module({
  imports: [EmailModule, TypeOrmModule.forFeature([UserEntity])],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
