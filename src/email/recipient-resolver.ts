import { Repository } from 'typeorm';
import { NotificationEventType } from '../common/enums/notification-event-type.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { UserStatus } from '../common/enums/user-status.enum';
import { UserEntity } from '../users/user.entity';
import {
  isAllowedDomainRecipient,
  isLocalRecipient,
  isValidEmailFormat,
} from './email-recipient-validator';

export const INSTITUTIONAL_EMAIL_EVENT_TYPES: NotificationEventType[] = [
  NotificationEventType.INSTITUTIONAL_PLANNING_VALIDATED_INITIAL,
  NotificationEventType.INSTITUTIONAL_FACTORY_DELIVERED,
  NotificationEventType.INSTITUTIONAL_PLANNING_VALIDATED_PRODUCTION,
  NotificationEventType.INSTITUTIONAL_LMS_UPLOAD_COMPLETED,
  NotificationEventType.INSTITUTIONAL_PLANNING_VALIDATED_LMS,
  NotificationEventType.INSTITUTIONAL_PRODUCT_APPROVED_ACADEMIC,
  NotificationEventType.INSTITUTIONAL_PRODUCT_REQUESTED_CHANGES,
  NotificationEventType.INSTITUTIONAL_RETURNED_TO_PRODUCT,
  NotificationEventType.INSTITUTIONAL_RETURNED_TO_FACTORY,
  NotificationEventType.INSTITUTIONAL_RETURNED_TO_LMS,
  NotificationEventType.PROJECT_READY_FOR_RADICATION,
  NotificationEventType.PLANNING_RADICATION_VALIDATED,
  NotificationEventType.PLANNING_RADICATION_RETURNED,
  NotificationEventType.PROJECT_FINALIZED,
  NotificationEventType.INSTITUTIONAL_FINALIZED,
];

const ROLE_RECIPIENT_MAP: Record<UserRole, UserRole[]> = {
  [UserRole.PRODUCT]: [UserRole.PRODUCT],
  [UserRole.FABRICA]: [UserRole.FABRICA],
  [UserRole.PLANEACION]: [UserRole.PLANEACION],
  [UserRole.LMS]: [UserRole.LMS],
  [UserRole.ADMIN]: [UserRole.ADMIN],
};

export function isInstitutionalEmailEvent(eventType: NotificationEventType | null | undefined): boolean {
  return Boolean(eventType && INSTITUTIONAL_EMAIL_EVENT_TYPES.includes(eventType));
}

/** Email seleccionable para envío lógico (ACTIVE, @cun.edu.co, no @local). */
export function isDeliverableInstitutionalEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return false;
  if (isLocalRecipient(trimmed)) return false;
  if (!isValidEmailFormat(trimmed)) return false;
  return isAllowedDomainRecipient(trimmed);
}

export function pickInstitutionalEmails(emails: string[]): string[] {
  return [...new Set(emails.filter(isDeliverableInstitutionalEmail))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export async function resolveRecipientsByRole(
  userRepo: Repository<UserEntity>,
  role: UserRole,
): Promise<string[]> {
  const users = await userRepo.find({
    where: { role, status: UserStatus.ACTIVE },
    select: { email: true },
  });
  return pickInstitutionalEmails(users.map((u) => u.email));
}

export async function resolvePrimaryInstitutionalRecipient(params: {
  primary?: string | null;
  roleFallback?: UserRole | null;
  userRepo: Repository<UserEntity>;
}): Promise<string | null> {
  const { primary, roleFallback, userRepo } = params;
  if (primary && isDeliverableInstitutionalEmail(primary)) {
    return primary.trim();
  }
  if (roleFallback) {
    const byRole = await resolveRecipientsByRole(userRepo, roleFallback);
    return byRole[0] ?? null;
  }
  return null;
}

export async function resolveRecipients(params: {
  eventType: NotificationEventType;
  roleTarget?: UserRole | null;
  userId?: string | null;
  userRepo: Repository<UserEntity>;
}): Promise<string[]> {
  const { eventType, roleTarget, userId, userRepo } = params;

  if (userId) {
    const user = await userRepo.findOne({ where: { id: userId, status: UserStatus.ACTIVE } });
    if (user?.email && isDeliverableInstitutionalEmail(user.email)) {
      return [user.email];
    }
  }

  if (roleTarget) {
    const roles = ROLE_RECIPIENT_MAP[roleTarget] ?? [roleTarget];
    const users = await userRepo.find({
      where: roles.map((role) => ({ role, status: UserStatus.ACTIVE })),
      select: { email: true },
    });
    const emails = pickInstitutionalEmails(users.map((u) => u.email));
    if (emails.length > 0) return emails;
  }

  return [];
}

export async function resolvePrimaryRecipient(params: {
  eventType: NotificationEventType;
  roleTarget?: UserRole | null;
  userId?: string | null;
  userRepo: Repository<UserEntity>;
}): Promise<string | null> {
  const recipients = await resolveRecipients(params);
  return recipients[0] ?? null;
}
