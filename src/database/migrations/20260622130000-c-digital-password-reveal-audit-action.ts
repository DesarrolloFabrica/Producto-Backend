import { MigrationInterface, QueryRunner } from 'typeorm';

export class CDigitalPasswordRevealAuditAction20260622130000 implements MigrationInterface {
  name = 'CDigitalPasswordRevealAuditAction20260622130000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'C_DIGITAL_PASSWORD_REVEALED'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL does not support removing enum values safely.
  }
}
