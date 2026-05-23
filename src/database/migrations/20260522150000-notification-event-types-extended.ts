import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationEventTypesExtended20260522150000 implements MigrationInterface {
  name = 'NotificationEventTypesExtended20260522150000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const values = [
      'SUBJECT_REJECTED',
      'PROJECT_DELIVERED',
      'PROJECT_CLOSED',
      'OBSERVATION_CREATED',
      'OBSERVATION_CORRECTION_APPLIED',
      'OBSERVATION_REOPENED',
      'OBSERVATION_VALIDATED',
    ];

    for (const value of values) {
      await queryRunner.query(
        `ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
  }

  public async down(): Promise<void> {
    // PostgreSQL no permite eliminar valores de enum de forma segura.
  }
}
