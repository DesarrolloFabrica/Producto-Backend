import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatedFromChange20260525200000 implements MigrationInterface {
  name = 'CreatedFromChange20260525200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "semesters" ADD COLUMN IF NOT EXISTS "created_from_change" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "created_from_change" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(
      `ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'NEW_SEMESTER_ADDED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'NEW_SUBJECT_ADDED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "subjects" DROP COLUMN IF EXISTS "created_from_change"`);
    await queryRunner.query(`ALTER TABLE "semesters" DROP COLUMN IF EXISTS "created_from_change"`);
  }
}
