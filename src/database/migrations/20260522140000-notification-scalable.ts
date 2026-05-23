import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationScalable20260522140000 implements MigrationInterface {
  name = 'NotificationScalable20260522140000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "notification_event_type" AS ENUM (
        'SUBJECT_PRODUCTION_STARTED',
        'SUBJECT_SENT_TO_PRODUCT',
        'SUBJECT_APPROVED',
        'SUBJECT_CHANGES_REQUESTED',
        'SUBJECT_CORRECTION_APPLIED',
        'PROJECT_MODIFIED'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD COLUMN "eventType" "notification_event_type",
      ADD COLUMN "projectId" uuid,
      ADD COLUMN "subjectId" uuid,
      ADD COLUMN "actionUrl" varchar(500),
      ADD COLUMN "readAt" timestamptz,
      ADD COLUMN "severity" varchar(20)
    `);

    await queryRunner.query(
      'CREATE INDEX "IDX_notifications_project_subject_event" ON "notifications" ("projectId", "subjectId", "eventType")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_notifications_subject_id" ON "notifications" ("subjectId")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_notifications_subject_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_notifications_project_subject_event"');
    await queryRunner.query(`
      ALTER TABLE "notifications"
      DROP COLUMN IF EXISTS "severity",
      DROP COLUMN IF EXISTS "readAt",
      DROP COLUMN IF EXISTS "actionUrl",
      DROP COLUMN IF EXISTS "subjectId",
      DROP COLUMN IF EXISTS "projectId",
      DROP COLUMN IF EXISTS "eventType"
    `);
    await queryRunner.query('DROP TYPE IF EXISTS "notification_event_type"');
  }
}
