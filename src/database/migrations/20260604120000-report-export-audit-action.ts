import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReportExportAuditAction20260604120000 implements MigrationInterface {
  name = 'ReportExportAuditAction20260604120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'REPORT_EXPORT'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL does not support removing enum values safely.
  }
}
