import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init20260521120000 implements MigrationInterface {
  name = 'Init20260521120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // For gen_random_uuid()
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query("CREATE TYPE \"user_role\" AS ENUM ('PRODUCT','FABRICA','ADMIN')");
    await queryRunner.query("CREATE TYPE \"user_status\" AS ENUM ('ACTIVE','INACTIVE')");

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(254) NOT NULL,
        "name" character varying(120) NOT NULL,
        "role" "user_role" NOT NULL,
        "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
        "passwordHash" character varying(255),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "users"');
    await queryRunner.query('DROP TYPE "user_status"');
    await queryRunner.query('DROP TYPE "user_role"');
  }
}
