import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationLegacyBackfill20260522160000 implements MigrationInterface {
  name = 'NotificationLegacyBackfill20260522160000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "notifications"
      SET "subjectId" = "entityId"::uuid
      WHERE "entityType" = 'SUBJECT'
        AND "subjectId" IS NULL
        AND "entityId" IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "notifications"
      SET "projectId" = "entityId"::uuid
      WHERE "entityType" = 'PROJECT'
        AND "projectId" IS NULL
        AND "entityId" IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "notifications" n
      SET "projectId" = o."projectId", "subjectId" = o."subjectId"
      FROM "observations" o
      WHERE n."entityType" = 'OBSERVATION'
        AND o.id::text = n."entityId"
        AND (n."projectId" IS NULL OR n."subjectId" IS NULL)
    `);

    await queryRunner.query(`
      UPDATE "notifications" n
      SET "projectId" = s."projectId"
      FROM "subjects" s
      WHERE n."entityType" = 'SUBJECT'
        AND s.id::text = n."entityId"
        AND n."projectId" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "notifications"
      SET "eventType" = 'SUBJECT_APPROVED', "type" = 'INFO'
      WHERE "eventType" IS NULL
        AND title IN ('Asignatura aprobada', 'Materia aprobada')
    `);

    await queryRunner.query(`
      UPDATE "notifications"
      SET "eventType" = 'SUBJECT_PRODUCTION_STARTED'
      WHERE "eventType" IS NULL AND title = 'Producción iniciada'
    `);

    await queryRunner.query(`
      UPDATE "notifications"
      SET "eventType" = 'PROJECT_MODIFIED'
      WHERE "eventType" IS NULL AND title = 'Solicitud modificada'
    `);

    await queryRunner.query(`
      UPDATE "notifications"
      SET "eventType" = 'OBSERVATION_CREATED'
      WHERE "eventType" IS NULL AND title = 'Nueva observación'
    `);

    await queryRunner.query(`
      UPDATE "notifications"
      SET "eventType" = 'OBSERVATION_CORRECTION_APPLIED'
      WHERE "eventType" IS NULL AND title = 'Corrección aplicada'
    `);

    await queryRunner.query(`
      UPDATE "notifications"
      SET "eventType" = 'SUBJECT_CHANGES_REQUESTED', "type" = 'CRITICAL'
      WHERE "eventType" IS NULL AND title = 'Corrección solicitada por Product'
    `);

    await queryRunner.query(`
      UPDATE "notifications"
      SET "eventType" = 'SUBJECT_SENT_TO_PRODUCT'
      WHERE "eventType" IS NULL AND title = 'Asignatura enviada a revisión'
    `);
  }

  public async down(): Promise<void> {
    // Los metadatos rellenados no se revierten de forma segura.
  }
}
