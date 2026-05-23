import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationEventType } from '../../common/enums/notification-event-type.enum';
import { NotificationType } from '../../common/enums/notification-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';

export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  userId!: string | null;

  @ApiPropertyOptional({ enum: UserRole, nullable: true })
  roleTarget!: UserRole | null;

  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty()
  isRead!: boolean;

  @ApiPropertyOptional({ nullable: true })
  entityType!: string | null;

  @ApiPropertyOptional({ nullable: true })
  entityId!: string | null;

  @ApiPropertyOptional({ enum: NotificationEventType, nullable: true })
  eventType!: NotificationEventType | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  projectId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  subjectId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  actionUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  readAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  severity!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class MarkAllReadResponseDto {
  @ApiProperty()
  updatedCount!: number;
}
