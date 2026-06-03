import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../common/enums/user-role.enum';
import { UserEntity } from '../users/user.entity';
import { ReportId } from './report-id.enum';
import { ReportingPolicyService } from './reporting-policy.service';

function user(role: UserRole, id = 'user-1'): UserEntity {
  return { id, role, email: 't@test.co', name: 'Test' } as UserEntity;
}

describe('ReportingPolicyService', () => {
  const policy = new ReportingPolicyService();

  it('allows PRODUCT on requests-general', () => {
    expect(() => policy.assertReportAccess(ReportId.REQUESTS_GENERAL, user(UserRole.PRODUCT))).not.toThrow();
  });

  it('denies FABRICA on requests-general', () => {
    expect(() => policy.assertReportAccess(ReportId.REQUESTS_GENERAL, user(UserRole.FABRICA))).toThrow(
      ForbiddenException,
    );
  });

  it('denies PRODUCT on radications pdf scope is ok but factory-production denied', () => {
    expect(() => policy.assertReportAccess(ReportId.FACTORY_PRODUCTION, user(UserRole.PRODUCT))).toThrow(
      ForbiddenException,
    );
  });

  it('allows ADMIN on audit-trail', () => {
    expect(() => policy.assertReportAccess(ReportId.AUDIT_TRAIL, user(UserRole.ADMIN))).not.toThrow();
  });

  it('denies PRODUCT on audit-trail', () => {
    expect(() => policy.assertReportAccess(ReportId.AUDIT_TRAIL, user(UserRole.PRODUCT))).toThrow(
      ForbiddenException,
    );
  });

  it('executive PDF only for ADMIN', () => {
    expect(() =>
      policy.assertPdfAccess(ReportId.SLA_COMPLIANCE, user(UserRole.ADMIN), {
        variant: 'executive',
      }),
    ).not.toThrow();
    expect(() =>
      policy.assertPdfAccess(ReportId.SLA_COMPLIANCE, user(UserRole.PRODUCT), {
        variant: 'executive',
      }),
    ).toThrow(ForbiddenException);
  });

  it('rejects SLA PDF without executive variant', () => {
    expect(() =>
      policy.assertPdfAccess(ReportId.SLA_COMPLIANCE, user(UserRole.ADMIN), {}),
    ).toThrow(BadRequestException);
  });

  it('rejects radications PDF without projectId', () => {
    expect(() =>
      policy.assertPdfAccess(ReportId.RADICATIONS, user(UserRole.PRODUCT), {}),
    ).toThrow(BadRequestException);
  });

  it('allows radications PDF with projectId', () => {
    expect(() =>
      policy.assertPdfAccess(ReportId.RADICATIONS, user(UserRole.PRODUCT), {
        projectId: 'proj-1',
      }),
    ).not.toThrow();
  });

  it('rejects requests-general PDF', () => {
    expect(() =>
      policy.assertPdfAccess(ReportId.REQUESTS_GENERAL, user(UserRole.PRODUCT), {
        variant: 'summary',
      }),
    ).toThrow(BadRequestException);
  });
});
