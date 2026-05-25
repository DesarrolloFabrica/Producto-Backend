import { MigrationInterface, QueryRunner } from 'typeorm';

export class SubjectExpectedDeliveryDate20260525120000 implements MigrationInterface {
  name = 'SubjectExpectedDeliveryDate20260525120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subjects"
      ADD COLUMN IF NOT EXISTS "expectedDeliveryDate" timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subjects"
      DROP COLUMN IF EXISTS "expectedDeliveryDate"
    `);
  }
}
