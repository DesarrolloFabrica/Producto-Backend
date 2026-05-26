import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProjectActivatedAtNullableDelivery20260526100000 implements MigrationInterface {
  name = 'ProjectActivatedAtNullableDelivery20260526100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "projects"
      ADD COLUMN IF NOT EXISTS "activatedAt" timestamptz
    `);

    await queryRunner.query(`
      ALTER TABLE "projects"
      ALTER COLUMN "expectedDeliveryDate" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "semesters"
      ALTER COLUMN "factoryExpectedDate" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "semesters"
      ALTER COLUMN "factoryExpectedDate" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "projects"
      ALTER COLUMN "expectedDeliveryDate" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "projects"
      DROP COLUMN IF EXISTS "activatedAt"
    `);
  }
}
