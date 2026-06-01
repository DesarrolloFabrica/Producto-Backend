/** Razón registrada en email_delivery_logs cuando se bloquea envío real a destinatario no institucional. */
export const REAL_MODE_RECIPIENT_BLOCK_REASON =
  'Destinatario no institucional o inválido para envío real';

const EMAIL_FORMAT_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getAllowedDomain(): string {
  return (process.env.EMAIL_ALLOWED_DOMAIN ?? 'cun.edu.co').trim().toLowerCase();
}

export function isBlockLocalRecipients(): boolean {
  return (process.env.EMAIL_BLOCK_LOCAL_RECIPIENTS ?? 'true').toLowerCase() === 'true';
}

export function isValidEmailFormat(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length > 0 && trimmed.length <= 254 && EMAIL_FORMAT_RE.test(trimmed);
}

export function isLocalRecipient(email: string): boolean {
  return email.trim().toLowerCase().endsWith('@local');
}

export function isAllowedDomainRecipient(email: string, allowedDomain = getAllowedDomain()): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(`@${allowedDomain}`);
}

/**
 * Valida destinatario para envío real (EMAIL_TEST_MODE=false).
 * Retorna razón de bloqueo o null si el destinatario es válido.
 */
export function getRealModeRecipientBlockReason(
  email: string,
  options?: { allowedDomain?: string; blockLocal?: boolean },
): string | null {
  const trimmed = email.trim();
  const allowedDomain = (options?.allowedDomain ?? getAllowedDomain()).toLowerCase();
  const blockLocal = options?.blockLocal ?? isBlockLocalRecipients();

  if (!trimmed || trimmed === 'unknown' || trimmed.startsWith('role:')) {
    return REAL_MODE_RECIPIENT_BLOCK_REASON;
  }

  if (blockLocal && isLocalRecipient(trimmed)) {
    return REAL_MODE_RECIPIENT_BLOCK_REASON;
  }

  if (!isValidEmailFormat(trimmed)) {
    return REAL_MODE_RECIPIENT_BLOCK_REASON;
  }

  if (!isAllowedDomainRecipient(trimmed, allowedDomain)) {
    return REAL_MODE_RECIPIENT_BLOCK_REASON;
  }

  return null;
}
