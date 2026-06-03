import { UserRole } from '../common/enums/user-role.enum';

const USER_ROLE_VALUES = new Set<string>(Object.values(UserRole));

export function isUserRole(value: string | undefined): value is UserRole {
  return Boolean(value && USER_ROLE_VALUES.has(value));
}

export function parsePositiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
}
