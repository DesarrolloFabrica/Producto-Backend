import { MigrationInterface, QueryRunner } from 'typeorm';

const VALUES = [
  'INSTITUTIONAL_PLANNING_VALIDATED_INITIAL',
  'INSTITUTIONAL_RETURNED_TO_PRODUCT',
  'INSTITUTIONAL_FACTORY_DELIVERED',
  'INSTITUTIONAL_PLANNING_VALIDATED_PRODUCTION',
  'INSTITUTIONAL_RETURNED_TO_FACTORY',
  'INSTITUTIONAL_LMS_UPLOAD_COMPLETED',
  'INSTITUTIONAL_PLANNING_VALIDATED_LMS',
  'INSTITUTIONAL_RETURNED_TO_LMS',
  'INSTITUTIONAL_PRODUCT_REQUESTED_CHANGES',
  'INSTITUTIONAL_PRODUCT_APPROVED_ACADEMIC',
  'INSTITUTIONAL_FINALIZED',
  'INSTITUTIONAL_REQUEST_CREATED',
];

export class InstitutionalNotificationEvents20260527120000 implements MigrationInterface {
  name = 'InstitutionalNotificationEvents20260527120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of VALUES) {
      await queryRunner.query(
        `ALTER TYPE "notification_event_type" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
  }

  public async down(): Promise<void> {}
}
