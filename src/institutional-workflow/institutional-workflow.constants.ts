import { OperationalCheckKey } from '../common/enums/operational-check-key.enum';
import { UserRole } from '../common/enums/user-role.enum';

export const OPERATIONAL_CHECK_DEFINITIONS: {
  key: OperationalCheckKey;
  label: string;
  responsibleRole: UserRole;
}[] = [
  {
    key: OperationalCheckKey.PLANNING_INITIAL_VALIDATED,
    label: 'Solicitud validada por Planeación',
    responsibleRole: UserRole.PLANEACION,
  },
  {
    key: OperationalCheckKey.FACTORY_CONTENT_DELIVERED,
    label: 'Contenido entregado por Fábrica',
    responsibleRole: UserRole.FABRICA,
  },
  {
    key: OperationalCheckKey.PLANNING_PRODUCTION_VALIDATED,
    label: 'Producción validada por Planeación',
    responsibleRole: UserRole.PLANEACION,
  },
  {
    key: OperationalCheckKey.LMS_UPLOAD_COMPLETED,
    label: 'Carga LMS completada',
    responsibleRole: UserRole.LMS,
  },
  {
    key: OperationalCheckKey.PLANNING_LMS_VALIDATED,
    label: 'LMS validado por Planeación',
    responsibleRole: UserRole.PLANEACION,
  },
  {
    key: OperationalCheckKey.PRODUCT_ACADEMIC_APPROVED,
    label: 'Revisión académica aprobada por Product',
    responsibleRole: UserRole.PRODUCT,
  },
  {
    key: OperationalCheckKey.PLANNING_FINAL_RADICATED,
    label: 'Radicación final por Planeación',
    responsibleRole: UserRole.PLANEACION,
  },
];

export const ACADEMIC_REVIEW_BLOCKED_MESSAGE =
  'La revisión académica se habilita cuando Planeación valide LMS.';
