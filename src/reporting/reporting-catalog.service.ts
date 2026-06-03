import { Injectable } from '@nestjs/common';
import { UserRole } from '../common/enums/user-role.enum';
import { UserEntity } from '../users/user.entity';
import { ReportId } from './report-id.enum';
import { ReportCatalogItemDto } from './dto/reporting-response.dto';

const CATALOG: ReportCatalogItemDto[] = [
  {
    id: ReportId.REQUESTS_GENERAL,
    name: 'Reporte General de Solicitudes',
    description: 'Portafolio de solicitudes con estado, owners, progreso y radicación.',
    allowedRoles: [UserRole.PRODUCT, UserRole.ADMIN],
    supportsExcel: true,
    supportsPdf: false,
    filterKeys: [
      'dateFrom',
      'dateTo',
      'school',
      'modality',
      'priority',
      'projectStatus',
      'institutionalState',
      'legacyWorkflow',
      'slaStatus',
      'query',
      'productOwnerId',
      'projectId',
    ],
  },
  {
    id: ReportId.FACTORY_PRODUCTION,
    name: 'Reporte Producción Fábrica',
    description: 'Semestres en ámbito Fábrica con producción, fechas y observaciones.',
    allowedRoles: [UserRole.FABRICA, UserRole.ADMIN],
    supportsExcel: true,
    supportsPdf: false,
    filterKeys: [
      'dateFrom',
      'dateTo',
      'school',
      'query',
      'operationalState',
      'factoryProductionStatus',
      'slaStatus',
      'factoryOwnerId',
    ],
  },
  {
    id: ReportId.OBSERVATIONS_CORRECTIONS,
    name: 'Reporte Observaciones y Correcciones',
    description: 'Observaciones con estado, autor, tiempos y vínculo académico.',
    allowedRoles: [UserRole.PRODUCT, UserRole.FABRICA, UserRole.ADMIN],
    supportsExcel: true,
    supportsPdf: false,
    filterKeys: [
      'dateFrom',
      'dateTo',
      'school',
      'query',
      'status',
      'role',
      'priority',
      'projectId',
      'semesterNumber',
      'onlyOpen',
    ],
  },
  {
    id: ReportId.RADICATIONS,
    name: 'Reporte Radicaciones',
    description: 'Radicaciones activas e historial institucional.',
    allowedRoles: [UserRole.PRODUCT, UserRole.ADMIN],
    supportsExcel: true,
    supportsPdf: false,
    filterKeys: [
      'dateFrom',
      'dateTo',
      'school',
      'query',
      'hasRadicationNumber',
      'radicationStatus',
      'projectId',
    ],
  },
  {
    id: ReportId.SLA_COMPLIANCE,
    name: 'Reporte SLA / Cumplimiento',
    description: 'Cumplimiento de tiempos por etapa institucional.',
    allowedRoles: [UserRole.PRODUCT, UserRole.FABRICA, UserRole.ADMIN],
    supportsExcel: true,
    supportsPdf: false,
    filterKeys: [
      'dateFrom',
      'dateTo',
      'school',
      'query',
      'operationalState',
      'slaStatus',
      'onlyOverdue',
      'onlyFinalized',
      'responsibleRole',
    ],
  },
  {
    id: ReportId.AUDIT_TRAIL,
    name: 'Reporte Auditoría',
    description: 'Log institucional de acciones y cambios.',
    allowedRoles: [UserRole.ADMIN],
    supportsExcel: true,
    supportsPdf: false,
    filterKeys: ['dateFrom', 'dateTo', 'entityType', 'auditRole', 'query'],
  },
  {
    id: ReportId.PRODUCTIVITY_BY_USER,
    name: 'Productividad por usuario',
    description: 'Transiciones y observaciones agrupadas por usuario.',
    allowedRoles: [UserRole.ADMIN],
    supportsExcel: true,
    supportsPdf: false,
    filterKeys: ['dateFrom', 'dateTo', 'auditRole'],
  },
  {
    id: ReportId.PRODUCTIVITY_BY_ROLE,
    name: 'Productividad por rol',
    description: 'Métricas agregadas por rol institucional.',
    allowedRoles: [UserRole.ADMIN],
    supportsExcel: true,
    supportsPdf: false,
    filterKeys: ['dateFrom', 'dateTo'],
  },
];

@Injectable()
export class ReportingCatalogService {
  getCatalogForUser(user: UserEntity): ReportCatalogItemDto[] {
    return CATALOG.filter((item) => item.allowedRoles.includes(user.role)).map((item) => ({
      ...item,
      supportsPdf: false,
    }));
  }
}
