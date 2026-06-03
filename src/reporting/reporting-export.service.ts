import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import PDFDocument = require('pdfkit');
import { AuditAction } from '../common/enums/audit-action.enum';
import { AuditService } from '../audit/audit.service';
import { UserEntity } from '../users/user.entity';
import { ReportingQueryDto } from './dto/reporting-query.dto';
import { ReportColumnDto, ReportPreviewResponseDto } from './dto/reporting-response.dto';
import { ReportId } from './report-id.enum';
import { reportExportMaxRows } from './reporting.config';
import {
  autoFitWorksheetColumns,
  buildExportFileName,
  formatExportCellValue,
  formatExportFilters,
  getReportDisplayName,
  INSTITUTIONAL_GRAY,
  INSTITUTIONAL_ORANGE,
  reorderExportColumns,
  softBorderStyle,
} from './reporting-export-format.util';
import { ReportingFilterOptionsService } from './reporting-filter-options.service';
import { roleLabel } from './reporting-labels.util';
import { ReportingQueryService } from './reporting-query.service';

export interface ExportResult {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  rowCount: number;
}

const PDF_UNAVAILABLE_MESSAGE = 'PDF no disponible para este reporte.';

@Injectable()
export class ReportingExportService {
  constructor(
    private readonly queryService: ReportingQueryService,
    private readonly auditService: AuditService,
    private readonly filterOptionsService: ReportingFilterOptionsService,
  ) {}

  async exportExcel(
    reportId: ReportId,
    query: ReportingQueryDto,
    user: UserEntity,
  ): Promise<ExportResult> {
    const data = await this.queryService.exportData(reportId, query, user);
    if (data.total > reportExportMaxRows()) {
      throw new PayloadTooLargeException(
        `El reporte supera el límite de ${reportExportMaxRows()} filas. Ajuste los filtros.`,
      );
    }

    const buffer = await this.buildExcelWorkbook(reportId, data, user, query);
    const fileName = buildExportFileName(reportId, 'xlsx');

    await this.logExport(user, reportId, 'xlsx', query, data.rows.length, fileName);

    return {
      buffer,
      fileName,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      rowCount: data.rows.length,
    };
  }

  async exportPdf(
    reportId: ReportId,
    query: ReportingQueryDto,
    user: UserEntity,
    variant?: string,
  ): Promise<ExportResult> {
    this.assertPdfConfiguration(reportId, query, variant);
    const buffer = await this.buildPdf(reportId, query, user, variant);
    const fileName = buildExportFileName(reportId, 'pdf', variant);

    await this.logExport(user, reportId, 'pdf', query, 0, fileName, variant);

    return {
      buffer,
      fileName,
      contentType: 'application/pdf',
      rowCount: 0,
    };
  }

  private assertPdfConfiguration(
    reportId: ReportId,
    query: ReportingQueryDto,
    variant?: string,
  ): void {
    if (reportId === ReportId.SLA_COMPLIANCE && (variant === 'executive' || query.executive)) {
      return;
    }
    if (reportId === ReportId.RADICATIONS && query.projectId?.trim()) {
      return;
    }
    throw new BadRequestException(PDF_UNAVAILABLE_MESSAGE);
  }

  private async logExport(
    user: UserEntity,
    reportId: ReportId,
    format: string,
    query: ReportingQueryDto,
    rowCount: number,
    fileName: string,
    variant?: string,
  ): Promise<void> {
    await this.auditService.createLog({
      entityType: 'REPORT',
      entityId: reportId,
      action: AuditAction.REPORT_EXPORT,
      userId: user.id,
      afterJson: {
        format,
        variant: variant ?? null,
        filters: query,
        rowCount,
        fileName,
        role: user.role,
        exportedAt: new Date().toISOString(),
      },
    });
  }

  private async buildExcelWorkbook(
    reportId: ReportId,
    data: ReportPreviewResponseDto,
    user: UserEntity,
    query: ReportingQueryDto,
  ): Promise<Buffer> {
    const workbook = new Workbook();
    workbook.creator = 'Operación Académica CUN';
    workbook.created = new Date();

    await this.buildSummarySheet(workbook, reportId, data, user, query);

    const sheets =
      data.sheets && data.sheets.length > 0
        ? data.sheets
        : [{ name: 'Datos', columns: data.columns, rows: data.rows }];

    for (const sheet of sheets) {
      this.buildDataSheet(workbook, sheet.name, sheet.columns, sheet.rows);
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async buildSummarySheet(
    workbook: Workbook,
    reportId: ReportId,
    data: ReportPreviewResponseDto,
    user: UserEntity,
    query: ReportingQueryDto,
  ): Promise<void> {
    const summary = workbook.addWorksheet('Resumen');
    summary.columns = [{ width: 28 }, { width: 72 }];

    summary.mergeCells('A1:B1');
    const titleCell = summary.getCell('A1');
    titleCell.value = 'Operación Académica CUN';
    titleCell.font = { bold: true, size: 18, color: { argb: INSTITUTIONAL_ORANGE } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    summary.getRow(1).height = 28;

    summary.mergeCells('A2:B2');
    const subtitleCell = summary.getCell('A2');
    subtitleCell.value = getReportDisplayName(reportId);
    subtitleCell.font = { bold: true, size: 13, color: { argb: 'FF334155' } };
    subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    summary.getRow(2).height = 22;

    const generatedAt = new Date().toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const filterOverrides: Record<string, string> = {};
    if (query.projectId?.trim()) {
      filterOverrides.projectId = await this.filterOptionsService.resolveProjectFilterLabel(
        query.projectId,
        user,
      );
    }

    const metadataRows: [string, string | number][] = [
      ['Usuario', user.name],
      ['Rol', roleLabel(user.role)],
      ['Fecha de generación', generatedAt],
      ['Total registros', data.total],
      ['Filtros aplicados', formatExportFilters(query, filterOverrides)],
    ];

    const headerRowIndex = 4;
    const headerRow = summary.getRow(headerRowIndex);
    headerRow.values = ['Campo', 'Valor'];
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: INSTITUTIONAL_ORANGE },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
    headerRow.height = 20;
    headerRow.eachCell((cell) => {
      cell.border = softBorderStyle();
    });

    metadataRows.forEach(([label, value], idx) => {
      const row = summary.getRow(headerRowIndex + 1 + idx);
      row.values = [label, value];
      row.getCell(1).font = { bold: true, color: { argb: 'FF475569' } };
      row.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: INSTITUTIONAL_GRAY },
      };
      row.getCell(2).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      row.eachCell((cell) => {
        cell.border = softBorderStyle();
      });
    });

    summary.getColumn(1).width = 28;
    summary.getColumn(2).width = 72;
  }

  private buildDataSheet(
    workbook: Workbook,
    sheetName: string,
    columns: ReportColumnDto[],
    rows: Record<string, unknown>[],
  ): void {
    const ws = workbook.addWorksheet(sheetName.slice(0, 31));
    const orderedColumns = reorderExportColumns(columns);
    const headerLabels = orderedColumns.map((c) => c.label);
    ws.addRow(headerLabels);

    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: INSTITUTIONAL_ORANGE },
    };
    header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    header.height = 22;
    header.eachCell((cell) => {
      cell.border = softBorderStyle();
    });

    for (const row of rows) {
      const values = orderedColumns.map((col) =>
        formatExportCellValue(col.key, row[col.key] ?? ''),
      );
      const dataRow = ws.addRow(values);
      dataRow.eachCell((cell) => {
        cell.border = softBorderStyle();
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
      });
    }

    if (orderedColumns.length > 0 && rows.length >= 0) {
      const lastCol = this.columnLetter(orderedColumns.length);
      ws.autoFilter = {
        from: 'A1',
        to: `${lastCol}1`,
      };
      ws.views = [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }];
    }

    autoFitWorksheetColumns(ws, rows.length + 1);
  }

  private columnLetter(colNumber: number): string {
    let letter = '';
    let n = colNumber;
    while (n > 0) {
      const rem = (n - 1) % 26;
      letter = String.fromCharCode(65 + rem) + letter;
      n = Math.floor((n - 1) / 26);
    }
    return letter;
  }

  private async buildPdf(
    reportId: ReportId,
    query: ReportingQueryDto,
    user: UserEntity,
    variant?: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text('Operación Académica CUN', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).fillColor('#64748b').text(getReportDisplayName(reportId), { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).fillColor('#64748b');
      doc.text(`Generado: ${new Date().toLocaleString('es-CO')}`);
      doc.text(`Usuario: ${user.name} (${roleLabel(user.role)})`);
      doc.moveDown();
      doc.fillColor('#000000');

      if (reportId === ReportId.SLA_COMPLIANCE && (variant === 'executive' || query.executive)) {
        void this.renderExecutiveSlaPdf(doc, query, user).then(() => doc.end()).catch(reject);
        return;
      }

      if (reportId === ReportId.RADICATIONS && query.projectId) {
        void this.renderRadicationPdf(doc, query.projectId, user).then(() => doc.end()).catch(reject);
        return;
      }

      reject(new BadRequestException(PDF_UNAVAILABLE_MESSAGE));
    });
  }

  private async renderExecutiveSlaPdf(
    doc: InstanceType<typeof PDFDocument>,
    query: ReportingQueryDto,
    user: UserEntity,
  ): Promise<void> {
    const { kpis, topPrograms } = await this.queryService.getExecutiveSlaSummary(query, user);
    doc.fontSize(14).text('Reporte Ejecutivo — SLA / Cumplimiento');
    doc.moveDown();
    doc.fontSize(11);
    doc.text(`Total semestres analizados: ${kpis.total}`);
    doc.text(`En tiempo: ${kpis.onTime} (${kpis.onTimePercent}%)`);
    doc.text(`En riesgo: ${kpis.atRisk}`);
    doc.text(`Vencidos: ${kpis.overdue}`);
    doc.moveDown();
    doc.fontSize(12).text('Top 10 programas críticos');
    doc.moveDown(0.5);
    for (const p of topPrograms) {
      doc.fontSize(10).text(`• ${p.program} (${p.school}) — ${p.slaLabel}`);
    }
  }

  private async renderRadicationPdf(
    doc: InstanceType<typeof PDFDocument>,
    projectId: string,
    user: UserEntity,
  ): Promise<void> {
    const row = await this.queryService.getRadicationPdfRow(projectId, user);
    if (!row) {
      throw new BadRequestException('No se encontró la solicitud o no tiene permiso.');
    }
    doc.fontSize(14).text('Acta de radicación');
    doc.moveDown();
    doc.fontSize(11);
    const labels: Record<string, string> = {
      projectId: 'ID solicitud',
      school: 'Escuela',
      program: 'Programa',
      productOwnerName: 'Owner Product',
      institutionalState: 'Estado institucional',
      readyForRadicationAt: 'Listo para radicación',
      productRadicationDueAt: 'Vencimiento radicación',
      radicationNumber: 'Nº radicación',
      radicatedAt: 'Fecha radicación',
      radicatedByName: 'Radicado por',
      radicationComment: 'Comentario',
      radicationEvidenceUrl: 'Evidencia',
    };
    for (const [key, value] of Object.entries(row)) {
      const label = labels[key] ?? key;
      doc.text(`${label}: ${String(value)}`);
    }
  }
}
