import { MigrationInterface, QueryRunner } from 'typeorm';

export class SubjectMatterExpert20260526120000 implements MigrationInterface {
  name = 'SubjectMatterExpert20260526120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "project_status" ADD VALUE IF NOT EXISTS 'PENDING_SUBJECT_MATTER_EXPERT'
    `);

    await queryRunner.query(`
      CREATE TYPE "subject_matter_expert_type" AS ENUM ('INTERNAL', 'EXTERNAL')
    `);

    await queryRunner.query(`
      CREATE TYPE "subject_matter_expert_status" AS ENUM ('READY', 'PENDING')
    `);

    await queryRunner.query(`
      ALTER TABLE "projects"
      ADD COLUMN IF NOT EXISTS "subjectMatterExpertType" "subject_matter_expert_type",
      ADD COLUMN IF NOT EXISTS "subjectMatterExpertStatus" "subject_matter_expert_status",
      ADD COLUMN IF NOT EXISTS "expertConfirmedAt" timestamptz
    `);

    await queryRunner.query(`
      UPDATE "projects"
      SET
        "subjectMatterExpertType" = 'INTERNAL',
        "subjectMatterExpertStatus" = 'READY',
        "activatedAt" = COALESCE("activatedAt", "createdAt"),
        "expertConfirmedAt" = COALESCE("expertConfirmedAt", "activatedAt", "createdAt")
      WHERE "subjectMatterExpertType" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "projects"
      ALTER COLUMN "subjectMatterExpertType" SET DEFAULT 'INTERNAL',
      ALTER COLUMN "subjectMatterExpertType" SET NOT NULL,
      ALTER COLUMN "subjectMatterExpertStatus" SET DEFAULT 'READY',
      ALTER COLUMN "subjectMatterExpertStatus" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "projects"
      DROP COLUMN IF EXISTS "expertConfirmedAt",
      DROP COLUMN IF EXISTS "subjectMatterExpertStatus",
      DROP COLUMN IF EXISTS "subjectMatterExpertType"
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS "subject_matter_expert_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "subject_matter_expert_type"`);
  }
}
