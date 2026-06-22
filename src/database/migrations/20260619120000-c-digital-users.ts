import { MigrationInterface, QueryRunner } from 'typeorm';

export class CDigitalUsers20260619120000 implements MigrationInterface {
  name = 'CDigitalUsers20260619120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "permissions" text[] NOT NULL DEFAULT '{}'`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "c_digital_users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "program_name" character varying(220) NOT NULL,
        "username" character varying(220) NOT NULL,
        "password_encrypted" text NOT NULL,
        "created_by_id" uuid NOT NULL,
        "updated_by_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_c_digital_users" PRIMARY KEY ("id"),
        CONSTRAINT "FK_c_digital_users_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_c_digital_users_updated_by" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_c_digital_users_program_name" ON "c_digital_users" ("program_name")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_c_digital_users_username" ON "c_digital_users" ("username")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_c_digital_users_deleted_at" ON "c_digital_users" ("deleted_at")`,
    );

    await queryRunner.query(`
      UPDATE "users"
      SET "permissions" = CASE
        WHEN "permissions" @> ARRAY['PRODUCTO_C_DIGITAL_USERS_ACCESS']::text[] THEN "permissions"
        ELSE array_append("permissions", 'PRODUCTO_C_DIGITAL_USERS_ACCESS')
      END
      WHERE LOWER("email") = 'zuany_acuna@cun.edu.co'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_c_digital_users_deleted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_c_digital_users_username"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_c_digital_users_program_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "c_digital_users"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "permissions"`);
  }
}
