import { MigrationInterface, QueryRunner } from 'typeorm';

export class SubjectFactoryProductionStatus20260603120000 implements MigrationInterface {
  name = 'SubjectFactoryProductionStatus20260603120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "factory_production_status" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "subjects"
        ADD COLUMN IF NOT EXISTS "factory_production_status" "factory_production_status" NOT NULL DEFAULT 'NOT_STARTED',
        ADD COLUMN IF NOT EXISTS "factory_production_completed_at" TIMESTAMPTZ NULL
    `);

    await queryRunner.query(`
      UPDATE "subjects" s
      SET
        "factory_production_status" = 'COMPLETED',
        "factory_production_completed_at" = COALESCE(s."updatedAt", NOW())
      WHERE s."deletedAt" IS NULL
        AND (s."progress" >= 100 OR s."status" IN ('IN_REVIEW', 'SUBMITTED', 'APPROVED'))
    `);

    await queryRunner.query(`
      UPDATE "subjects" s
      SET "factory_production_status" = 'IN_PROGRESS'
      WHERE s."deletedAt" IS NULL
        AND s."factory_production_status" = 'NOT_STARTED'
        AND s."status" = 'IN_PRODUCTION'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subjects"
        DROP COLUMN IF EXISTS "factory_production_completed_at",
        DROP COLUMN IF EXISTS "factory_production_status"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "factory_production_status"`);
  }
}
