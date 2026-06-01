import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class EmailDeliveryLogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class EmailDeliveryLogItemDto {
  id!: string;
  notificationId!: string | null;
  eventType!: string | null;
  originalRecipient!: string;
  effectiveRecipient!: string;
  subject!: string;
  status!: string;
  provider!: string;
  errorMessage!: string | null;
  metadata!: Record<string, unknown> | null;
  createdAt!: string;
}

export class EmailDeliveryLogListResponseDto {
  items!: EmailDeliveryLogItemDto[];
  total!: number;
}

export class SendMailResultDto {
  success!: boolean;
  effectiveRecipient!: string;
  status!: string;
  originalRecipient?: string;
}
