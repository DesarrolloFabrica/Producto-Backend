import { MigrationInterface, QueryRunner } from 'typeorm';

export class InstitutionalHardening20260622120000 implements MigrationInterface {
  name = 'InstitutionalHardening20260622120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(`ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'C_DIGITAL_PASSWORD_REVEALED'`);

    for (const table of [
      'subject_operational_checks',
      'operational_transitions',
      'observation_batches',
      'email_delivery_logs',
      'project_radications',
      'project_operational_transitions',
      'semester_operational_checks',
      'semester_operational_transitions',
      'c_digital_users',
    ]) {
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`);
    }

    await queryRunner.query(`UPDATE "projects" SET "progress" = LEAST(100, GREATEST(0, "progress"))`);
    await queryRunner.query(`UPDATE "subjects" SET "progress" = LEAST(100, GREATEST(0, "progress"))`);

    await queryRunner.query(`
      ALTER TABLE "projects"
      ADD CONSTRAINT "CHK_projects_progress_range"
      CHECK ("progress" BETWEEN 0 AND 100)
    `);
    await queryRunner.query(`
      ALTER TABLE "subjects"
      ADD CONSTRAINT "CHK_subjects_progress_range"
      CHECK ("progress" BETWEEN 0 AND 100)
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_projects_institutional_state" ON "projects" ("institutional_state")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_projects_status_priority_expected_delivery" ON "projects" ("status", "priority", "expectedDeliveryDate")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_subjects_project_operational_deleted" ON "subjects" ("projectId", "operational_state", "deletedAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_subjects_semester_operational_deleted" ON "subjects" ("semesterId", "operational_state", "deletedAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notifications_user_read_created" ON "notifications" ("userId", "isRead", "createdAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_audit_logs_entity_created" ON "audit_logs" ("entityType", "entityId", "createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_entity_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notifications_user_read_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subjects_semester_operational_deleted"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_subjects_project_operational_deleted"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_projects_status_priority_expected_delivery"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_projects_institutional_state"`);
    await queryRunner.query(`ALTER TABLE "subjects" DROP CONSTRAINT IF EXISTS "CHK_subjects_progress_range"`);
    await queryRunner.query(`ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "CHK_projects_progress_range"`);
  }
}
