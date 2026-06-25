import { MigrationInterface, QueryRunner } from 'typeorm';

const EXCLUSIVE_PERMISSION = 'PRODUCTO_C_DIGITAL_USERS_EXCLUSIVE';

const C_DIGITAL_EXCLUSIVE_USERS = [
  { email: 'angie_fontechapa@cun.edu.co', name: 'Angie Fontechapa' },
  { email: 'juan_ninop@cun.edu.co', name: 'Juan Niño' },
] as const;

export class CDigitalExclusiveUsers20260625120000 implements MigrationInterface {
  name = 'CDigitalExclusiveUsers20260625120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const user of C_DIGITAL_EXCLUSIVE_USERS) {
      await queryRunner.query(
        `
        INSERT INTO "users" ("email", "name", "role", "status", "permissions")
        VALUES (LOWER($1), $2, 'PRODUCT', 'ACTIVE', ARRAY[$3]::text[])
        ON CONFLICT ("email") DO UPDATE
        SET
          "name" = EXCLUDED."name",
          "role" = 'PRODUCT',
          "status" = 'ACTIVE',
          "permissions" = ARRAY[$3]::text[]
        `,
        [user.email, user.name, EXCLUSIVE_PERMISSION],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const user of C_DIGITAL_EXCLUSIVE_USERS) {
      await queryRunner.query(
        `
        UPDATE "users"
        SET "permissions" = array_remove("permissions", $2)
        WHERE LOWER("email") = LOWER($1)
        `,
        [user.email, EXCLUSIVE_PERMISSION],
      );
    }
  }
}
