import { Worksheet } from 'exceljs';
import { UserRole } from '../common/enums/user-role.enum';
import { ReportingQueryDto } from './dto/reporting-query.dto';
import { ReportColumnDto } from './dto/reporting-response.dto';
import { ReportId } from './report-id.enum';
import {
  factoryProductionStatusLabel,
  formatReportDate,
  formatReportDateTime,
  institutionalStateLabel,
  modalityLabel,
  observationStatusLabel,
  priorityLabel,
  projectInstitutionalStateLabel,
  projectStatusLabel,
  radicationStatusLabel,
  roleLabel,
  slaStatusLabel,
} from './reporting-labels.util';

export const INSTITUTIONAL_ORANGE = 'FFF97316';
export const INSTITUTIONAL_ORANGE_LIGHT = 'FFFFF7ED';
export const INSTITUTIONAL_GRAY = 'FFF1F5F9';
export const BORDER_COLOR = 'FFE2E8F0';

const REPORT_FILE_SLUGS: Record<ReportId, string> = {
  [ReportId.REQUESTS_GENERAL]: 'ReporteSolicitudes',
  [ReportId.FACTORY_PRODUCTION]: 'ReporteProduccionFabrica',
  [ReportId.OBSERVATIONS_CORRECTIONS]: 'ReporteObservaciones',
  [ReportId.RADICATIONS]: 'ReporteRadicaciones',
  [ReportId.SLA_COMPLIANCE]: 'ReporteSLA',
  [ReportId.AUDIT_TRAIL]: 'ReporteAuditoria',
  [ReportId.PRODUCTIVITY_BY_USER]: 'ReporteProductividadUsuario',
  [ReportId.PRODUCTIVITY_BY_ROLE]: 'ReporteProductividadRol',
};

export const REPORT_DISPLAY_NAMES: Record<ReportId, string> = {
  [ReportId.REQUESTS_GENERAL]: 'Reporte General de Solicitudes',
  [ReportId.FACTORY_PRODUCTION]: 'Reporte Producción Fábrica',
  [ReportId.OBSERVATIONS_CORRECTIONS]: 'Reporte Observaciones y Correcciones',
  [ReportId.RADICATIONS]: 'Reporte Radicaciones',
  [ReportId.SLA_COMPLIANCE]: 'Reporte SLA / Cumplimiento',
  [ReportId.AUDIT_TRAIL]: 'Reporte Auditoría',
  [ReportId.PRODUCTIVITY_BY_USER]: 'Productividad por usuario',
  [ReportId.PRODUCTIVITY_BY_ROLE]: 'Productividad por rol',
};

const FILTER_LABELS: Record<string, string> = {
  dateFrom: 'Desde',
  dateTo: 'Hasta',
  school: 'Escuela',
  modality: 'Modalidad',
  priority: 'Prioridad',
  projectStatus: 'Estado solicitud',
  institutionalState: 'Estado institucional',
  legacyWorkflow: 'Flujo legacy',
  slaStatus: 'SLA',
  query: 'Búsqueda',
  productOwnerId: 'Owner Product',
  factoryOwnerId: 'Owner Fábrica',
  projectId: 'Programa',
  operationalState: 'Estado operativo',
  factoryProductionStatus: 'Estado producción',
  status: 'Estado',
  role: 'Rol',
  semesterNumber: 'Semestre Nº',
  onlyOpen: 'Solo abiertas',
  onlyOverdue: 'Solo vencidos',
  onlyFinalized: 'Solo finalizados',
  responsibleRole: 'Rol responsable',
  hasRadicationNumber: 'Con Nº radicación',
  radicationStatus: 'Estado radicación',
  entityType: 'Tipo entidad',
  auditRole: 'Rol auditoría',
};

const INTERNAL_QUERY_KEYS = new Set(['page', 'limit', 'variant', 'executive']);

const ID_COLUMN_KEYS = new Set(['projectId', 'semesterId']);

export function buildExportFileName(reportId: ReportId, ext: string, variant?: string): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const base = REPORT_FILE_SLUGS[reportId] ?? 'Reporte';
  const variantSuffix =
    variant === 'executive' ? '_Ejecutivo' : variant === 'summary' ? '_Resumen' : '';
  return `OperacionAcademicaCUN_${base}${variantSuffix}_${stamp}.${ext}`;
}

export function getReportDisplayName(reportId: ReportId): string {
  return REPORT_DISPLAY_NAMES[reportId] ?? reportId;
}

function formatFilterValue(key: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (value === 'all') return 'Todos';
  if (key === 'hasRadicationNumber') {
    if (value === true || value === 'true') return 'Con número';
    if (value === false || value === 'false') return 'Sin número';
  }
  if (key === 'modality') return modalityLabel(String(value));
  if (key === 'priority') return priorityLabel(String(value));
  if (key === 'projectStatus') return projectStatusLabel(String(value));
  if (key === 'institutionalState') return projectInstitutionalStateLabel(String(value));
  if (key === 'operationalState') return institutionalStateLabel(String(value));
  if (key === 'status') return observationStatusLabel(String(value));
  if (key === 'factoryProductionStatus') return factoryProductionStatusLabel(String(value));
  if (key === 'radicationStatus') return radicationStatusLabel(String(value));
  if (key === 'slaStatus') return slaStatusLabel(String(value));
  if (key === 'role' || key === 'auditRole' || key === 'responsibleRole') {
    return roleLabel(String(value) as UserRole);
  }
  return String(value);
}

export function formatExportFilters(
  query: ReportingQueryDto,
  valueOverrides?: Record<string, string>,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (INTERNAL_QUERY_KEYS.has(key)) continue;
    if (value === undefined || value === null || value === '' || value === false) continue;
    const label = FILTER_LABELS[key] ?? key;
    const formatted =
      valueOverrides?.[key] ?? formatFilterValue(key, value);
    parts.push(`${label}: ${formatted}`);
  }
  return parts.length > 0 ? parts.join('; ') : 'Sin filtros aplicados';
}

export function reorderExportColumns(columns: ReportColumnDto[]): ReportColumnDto[] {
  const primary: ReportColumnDto[] = [];
  const ids: ReportColumnDto[] = [];
  for (const col of columns) {
    if (ID_COLUMN_KEYS.has(col.key) || col.key.endsWith('Id')) {
      ids.push(col);
    } else {
      primary.push(col);
    }
  }
  return [...primary, ...ids];
}

export function smeStatusLabel(status: string): string {
  const map: Record<string, string> = {
    READY: 'Listo',
    PENDING: 'Pendiente',
  };
  return map[String(status).toUpperCase()] ?? String(status);
}

export function formatExportCellValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'smeStatus') return smeStatusLabel(String(value));
  if (key.endsWith('At') || key.endsWith('Date') || key.includes('Date')) {
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      return raw.includes('T') || raw.includes(':')
        ? formatReportDateTime(raw)
        : formatReportDate(raw);
    }
  }
  return value;
}

export function softBorderStyle() {
  return {
    top: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
    left: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
    bottom: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
    right: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
  };
}

export function autoFitWorksheetColumns(
  ws: Worksheet,
  rowCount: number,
  minWidth = 10,
  maxWidth = 48,
): void {
  for (let colIdx = 1; colIdx <= ws.columnCount; colIdx += 1) {
    let maxLen = minWidth;
    for (let rowIdx = 1; rowIdx <= rowCount; rowIdx += 1) {
      const cell = ws.getRow(rowIdx).getCell(colIdx);
      const len = String(cell.value ?? '').length;
      if (len > maxLen) maxLen = len;
    }
    ws.getColumn(colIdx).width = Math.min(maxWidth, Math.max(minWidth, maxLen + 2));
  }
}
