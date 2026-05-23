import { BadRequestException } from '@nestjs/common';
import { ChecklistStatus } from '../common/enums/checklist-status.enum';
import { UserRole } from '../common/enums/user-role.enum';

const FABRICA_ALLOWED: Partial<Record<ChecklistStatus, ChecklistStatus[]>> = {
  [ChecklistStatus.PENDIENTE]: [ChecklistStatus.EN_PRODUCCION],
  [ChecklistStatus.EN_PRODUCCION]: [ChecklistStatus.ENTREGADO],
  [ChecklistStatus.ENTREGADO]: [ChecklistStatus.EN_PRODUCCION],
};

/** Checklist general de asignatura — ownerRole PRODUCT. */
const PRODUCT_SUBJECT_ALLOWED: Partial<Record<ChecklistStatus, ChecklistStatus[]>> = {
  [ChecklistStatus.PENDIENTE]: [ChecklistStatus.APROBADO, ChecklistStatus.RECHAZADO],
  [ChecklistStatus.APROBADO]: [ChecklistStatus.RECHAZADO, ChecklistStatus.PENDIENTE],
  [ChecklistStatus.RECHAZADO]: [ChecklistStatus.APROBADO, ChecklistStatus.PENDIENTE],
};

/** Checklist por tema — ownerRole FABRICA, revisado por Product tras ENTREGADO. */
const PRODUCT_FACTORY_ALLOWED: Partial<Record<ChecklistStatus, ChecklistStatus[]>> = {
  [ChecklistStatus.ENTREGADO]: [ChecklistStatus.APROBADO, ChecklistStatus.RECHAZADO],
  [ChecklistStatus.APROBADO]: [ChecklistStatus.RECHAZADO, ChecklistStatus.ENTREGADO],
  [ChecklistStatus.RECHAZADO]: [ChecklistStatus.APROBADO, ChecklistStatus.ENTREGADO],
};

const PRODUCT_FORBIDDEN_TARGETS = new Set<ChecklistStatus>([ChecklistStatus.EN_PRODUCCION]);

export function assertChecklistStatusTransition(
  role: UserRole,
  from: ChecklistStatus,
  to: ChecklistStatus,
  ownerRole?: UserRole,
): void {
  if (from === to) {
    throw new BadRequestException('Status is already set to the requested value');
  }

  if (role === UserRole.ADMIN) return;

  if (role === UserRole.FABRICA) {
    if (ownerRole === UserRole.PRODUCT) {
      throw new BadRequestException('FABRICA cannot update PRODUCT checklist items');
    }
    const allowed = FABRICA_ALLOWED[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `FABRICA cannot transition checklist from ${from} to ${to}`,
      );
    }
    if (to === ChecklistStatus.APROBADO || to === ChecklistStatus.RECHAZADO) {
      throw new BadRequestException('FABRICA cannot set APROBADO or RECHAZADO');
    }
    return;
  }

  if (role === UserRole.PRODUCT) {
    if (PRODUCT_FORBIDDEN_TARGETS.has(to)) {
      throw new BadRequestException('PRODUCT cannot set EN_PRODUCCION manually');
    }
    const allowedMap =
      ownerRole === UserRole.PRODUCT ? PRODUCT_SUBJECT_ALLOWED : PRODUCT_FACTORY_ALLOWED;
    const allowed = allowedMap[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `PRODUCT cannot transition checklist from ${from} to ${to}`,
      );
    }
    return;
  }

  throw new BadRequestException('Role not allowed to update checklist status');
}
