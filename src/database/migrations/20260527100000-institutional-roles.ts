import { MigrationInterface, QueryRunner } from 'typeorm';

export class InstitutionalRoles20260527100000 implements MigrationInterface {
  name = 'InstitutionalRoles20260527100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'PLANEACION'`,
    );
    await queryRunner.query(`ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'LMS'`);
  }

  public async down(): Promise<void> {
    // PostgreSQL no permite eliminar valores de enum de forma segura sin recrear el tipo.
  }
}
