import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Brackets, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { SubjectMatterExpertStatus } from '../common/enums/subject-matter-expert-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { ProjectEntity } from '../projects/project.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { UserEntity } from '../users/user.entity';
import { ReportingQueryDto } from './dto/reporting-query.dto';
import { ReportId } from './report-id.enum';
import { FACTORY_VISIBLE_SEMESTER_STATES } from './reporting-scope.constants';

const PDF_UNAVAILABLE_MESSAGE = 'PDF no disponible para este reporte.';

const REPORT_ACCESS: Record<ReportId, UserRole[]> = {
  [ReportId.REQUESTS_GENERAL]: [UserRole.PRODUCT, UserRole.ADMIN],
  [ReportId.FACTORY_PRODUCTION]: [UserRole.FABRICA, UserRole.ADMIN],
  [ReportId.OBSERVATIONS_CORRECTIONS]: [UserRole.PRODUCT, UserRole.FABRICA, UserRole.ADMIN],
  [ReportId.RADICATIONS]: [UserRole.PRODUCT, UserRole.ADMIN],
  [ReportId.SLA_COMPLIANCE]: [UserRole.PRODUCT, UserRole.FABRICA, UserRole.ADMIN],
  [ReportId.AUDIT_TRAIL]: [UserRole.ADMIN],
  [ReportId.PRODUCTIVITY_BY_USER]: [UserRole.ADMIN],
  [ReportId.PRODUCTIVITY_BY_ROLE]: [UserRole.ADMIN],
};

@Injectable()
export class ReportingPolicyService {
  assertReportAccess(reportId: ReportId, user: UserEntity): void {
    const allowed = REPORT_ACCESS[reportId];
    if (!allowed?.includes(user.role)) {
      throw new ForbiddenException(`Role ${user.role} cannot access report ${reportId}`);
    }
  }

  assertPdfAccess(reportId: ReportId, user: UserEntity, query: ReportingQueryDto): void {
    if (reportId === ReportId.SLA_COMPLIANCE) {
      if (query.variant !== 'executive' && !query.executive) {
        throw new BadRequestException(PDF_UNAVAILABLE_MESSAGE);
      }
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Executive SLA PDF is ADMIN only');
      }
      return;
    }

    if (reportId === ReportId.RADICATIONS) {
      if (user.role !== UserRole.PRODUCT && user.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Radication PDF is not available for this role');
      }
      if (!query.projectId?.trim()) {
        throw new BadRequestException(PDF_UNAVAILABLE_MESSAGE);
      }
      return;
    }

    throw new BadRequestException(PDF_UNAVAILABLE_MESSAGE);
  }

  applyProjectScope<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    user: UserEntity,
    alias = 'project',
  ): SelectQueryBuilder<T> {
    qb.andWhere(`${alias}.deletedAt IS NULL`);

    if (user.role === UserRole.ADMIN) {
      return qb;
    }

    if (user.role === UserRole.PRODUCT) {
      return qb.andWhere(`${alias}.productOwnerId = :scopeUserId`, { scopeUserId: user.id });
    }

    if (user.role === UserRole.FABRICA) {
      return qb
        .andWhere(`${alias}.subjectMatterExpertStatus = :smeReady`, {
          smeReady: SubjectMatterExpertStatus.READY,
        })
        .andWhere(
          new Brackets((sub) => {
            sub
              .where(`${alias}.factoryOwnerId = :scopeUserId`, { scopeUserId: user.id })
              .orWhere(
                new Brackets((unassigned) => {
                  unassigned
                    .where(`${alias}.factoryOwnerId IS NULL`)
                    .andWhere(`${alias}.status IN (:...visibleStatuses)`, {
                      visibleStatuses: [
                        ProjectStatus.READY_FOR_PRODUCTION,
                        ProjectStatus.IN_PRODUCTION,
                        ProjectStatus.FEEDBACK_PENDING,
                        ProjectStatus.IN_REVIEW,
                      ],
                    });
                }),
              );
          }),
        );
    }

    return qb.andWhere('1 = 0');
  }

  applySemesterScope<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    user: UserEntity,
    projectAlias = 'project',
    semesterAlias = 'semester',
  ): SelectQueryBuilder<T> {
    qb.andWhere(`${semesterAlias}.deletedAt IS NULL`);

    if (user.role === UserRole.ADMIN) {
      return qb;
    }

    if (user.role === UserRole.PRODUCT) {
      return qb.andWhere(`${projectAlias}.productOwnerId = :scopeUserId`, {
        scopeUserId: user.id,
      });
    }

    if (user.role === UserRole.FABRICA) {
      return qb.andWhere(`${semesterAlias}.operationalState IN (:...factoryStates)`, {
        factoryStates: FACTORY_VISIBLE_SEMESTER_STATES,
      });
    }

    return qb.andWhere('1 = 0');
  }
}
