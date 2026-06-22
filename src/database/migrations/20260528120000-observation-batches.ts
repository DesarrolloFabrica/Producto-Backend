import { MigrationInterface, QueryRunner } from 'typeorm';

export class ObservationBatches20260528120000 implements MigrationInterface {
  name = 'ObservationBatches20260528120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "observation_notification_status" AS ENUM ('PENDING', 'SENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "observation_batch_type" AS ENUM ('PRODUCT_OBSERVATIONS', 'FACTORY_CORRECTIONS')`,
    );

    await queryRunner.query(`
      CREATE TABLE "observation_batches" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "projectId" uuid NOT NULL,
        "subjectId" uuid NOT NULL,
        "type" "observation_batch_type" NOT NULL,
        "senderRole" "user_role" NOT NULL,
        "receiverRole" "user_role" NOT NULL,
        "sentAt" TIMESTAMPTZ NOT NULL,
        "sentById" uuid NOT NULL,
        "metadata" jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_observation_batches" PRIMARY KEY ("id"),
        CONSTRAINT "FK_observation_batches_project" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_observation_batches_subject" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_observation_batches_sent_by" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_observation_batches_subject" ON "observation_batches" ("subjectId")`,
    );

    await queryRunner.query(`
      ALTER TABLE "observations"
      ADD COLUMN "notificationStatus" "observation_notification_status" NOT NULL DEFAULT 'SENT',
      ADD COLUMN "correctionNotificationStatus" "observation_notification_status",
      ADD COLUMN "notificationBatchId" uuid,
      ADD COLUMN "sentAt" TIMESTAMPTZ,
      ADD COLUMN "sentById" uuid,
      ADD CONSTRAINT "FK_observations_notification_batch" FOREIGN KEY ("notificationBatchId") REFERENCES "observation_batches"("id") ON DELETE SET NULL,
      ADD CONSTRAINT "FK_observations_sent_by" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_observations_subject_notification" ON "observations" ("subjectId", "notificationStatus")`,
    );

    await queryRunner.query(`
      UPDATE "observations"
      SET "notificationStatus" = 'SENT', "sentAt" = "createdAt"
      WHERE "notificationStatus" IS NULL OR "notificationStatus" = 'SENT'
    `);

    await queryRunner.query(
      `ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'OBSERVATION_BATCH_SENT'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS 'CORRECTION_BATCH_NOTIFIED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "observations" DROP CONSTRAINT "FK_observations_sent_by"`);
    await queryRunner.query(
      `ALTER TABLE "observations" DROP CONSTRAINT "FK_observations_notification_batch"`,
    );
    await queryRunner.query(`
      ALTER TABLE "observations"
      DROP COLUMN "sentById",
      DROP COLUMN "sentAt",
      DROP COLUMN "notificationBatchId",
      DROP COLUMN "correctionNotificationStatus",
      DROP COLUMN "notificationStatus"
    `);
    await queryRunner.query(`DROP TABLE "observation_batches"`);
    await queryRunner.query(`DROP TYPE "observation_batch_type"`);
    await queryRunner.query(`DROP TYPE "observation_notification_status"`);
  }
}
