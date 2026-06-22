import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailDeliveryLogs20260529120000 implements MigrationInterface {
  name = 'EmailDeliveryLogs20260529120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "email_delivery_status" AS ENUM ('SENT', 'FAILED', 'SKIPPED')
    `);

    await queryRunner.query(`
      CREATE TABLE "email_delivery_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "notificationId" uuid,
        "eventType" character varying(80),
        "originalRecipient" character varying(254) NOT NULL,
        "effectiveRecipient" character varying(254) NOT NULL,
        "subject" character varying(500) NOT NULL,
        "status" "email_delivery_status" NOT NULL,
        "provider" character varying(40) NOT NULL,
        "errorMessage" text,
        "metadata" jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_delivery_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_email_delivery_logs_notification"
          FOREIGN KEY ("notificationId") REFERENCES "notifications"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_email_delivery_logs_notificationId"
        ON "email_delivery_logs" ("notificationId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_email_delivery_logs_status"
        ON "email_delivery_logs" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_email_delivery_logs_createdAt"
        ON "email_delivery_logs" ("createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email_delivery_logs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "email_delivery_status"`);
  }
}
