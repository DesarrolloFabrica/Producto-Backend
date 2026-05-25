import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChecklistBulkApproveAudit20260525180000 implements MigrationInterface {
  name = 'ChecklistBulkApproveAudit20260525180000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'CHECKLIST_SECTION_BULK_APPROVED'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL no permite eliminar valores de enum de forma segura sin recrear el tipo.
  }
}
