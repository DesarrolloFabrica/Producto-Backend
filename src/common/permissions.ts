export const PRODUCTO_C_DIGITAL_USERS_ACCESS = 'PRODUCTO_C_DIGITAL_USERS_ACCESS';
export const PRODUCTO_C_DIGITAL_USERS_EXCLUSIVE = 'PRODUCTO_C_DIGITAL_USERS_EXCLUSIVE';

export const C_DIGITAL_USERS_PERMISSIONS = [
  PRODUCTO_C_DIGITAL_USERS_ACCESS,
  PRODUCTO_C_DIGITAL_USERS_EXCLUSIVE,
] as const;

export type Permission =
  | typeof PRODUCTO_C_DIGITAL_USERS_ACCESS
  | typeof PRODUCTO_C_DIGITAL_USERS_EXCLUSIVE;

export function hasCDigitalUsersPermission(permissions: string[] | null | undefined): boolean {
  const set = new Set(permissions ?? []);
  return C_DIGITAL_USERS_PERMISSIONS.some((permission) => set.has(permission));
}

export function isCDigitalExclusiveUser(permissions: string[] | null | undefined): boolean {
  return (permissions ?? []).includes(PRODUCTO_C_DIGITAL_USERS_EXCLUSIVE);
}
