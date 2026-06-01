import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { NotificationEntity } from '../notifications/notification.entity';
import { ProjectEntity } from '../projects/project.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { UserEntity } from '../users/user.entity';
import { EmailController } from './email.controller';
import { EmailDeliveryLogEntity } from './email-delivery-log.entity';
import { EmailService } from './email.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmailDeliveryLogEntity,
      UserEntity,
      SubjectEntity,
      ProjectEntity,
      NotificationEntity,
    ]),
    AuthModule,
  ],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
