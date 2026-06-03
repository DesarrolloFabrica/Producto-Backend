import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { FactoryProductionStatus } from '../common/enums/factory-production-status.enum';
import { Modality } from '../common/enums/modality.enum';
import { ObservationStatus } from '../common/enums/observation-status.enum';
import { Priority } from '../common/enums/priority.enum';
import { ProjectInstitutionalState } from '../common/enums/project-institutional-state.enum';
import { ProjectRadicationStatus } from '../common/enums/project-radication-status.enum';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { SlaStatus } from '../common/enums/sla-status.enum';
import { INSTITUTIONAL_STATE_LABELS } from '../audit/audit-display.labels';
import { ProjectEntity } from '../projects/project.entity';
import { SemesterEntity } from '../semesters/semester.entity';
import { UserEntity } from '../users/user.entity';
import {
  ReportFilterOptionDto,
  ReportFilterOptionsDto,
  ReportRadicatedProgramOptionDto,
} from './dto/reporting-filter-options.dto';
import { ReportSearchSuggestionDto } from './dto/reporting-search-suggestion.dto';
import { ReportId } from './report-id.enum';
import { ReportingCatalogService } from './reporting-catalog.service';
import {
  factoryProductionStatusLabel,
  modalityLabel,
  observationStatusLabel,
  priorityLabel,
  projectInstitutionalStateLabel,
  projectStatusLabel,
  radicationStatusLabel,
  slaStatusLabel,
} from './reporting-labels.util';
import { ReportingPolicyService } from './reporting-policy.service';

function enumOptions(values: string[], labelFn: (v: string) => string): ReportFilterOptionDto[] {
  return values.map((value) => ({ value, label: labelFn(value) }));
}

@Injectable()
export class ReportingFilterOptionsService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(SemesterEntity)
    private readonly semesterRepo: Repository<SemesterEntity>,
    private readonly catalogService: ReportingCatalogService,
    private readonly policy: ReportingPolicyService,
  ) {}

  async getFilterOptions(reportId: ReportId, user: UserEntity): Promise<ReportFilterOptionsDto> {
    this.policy.assertReportAccess(reportId, user);
    const catalogItem = this.catalogService
      .getCatalogForUser(user)
      .find((item) => item.id === reportId);
    if (!catalogItem) {
      return { reportId, schools: [] };
    }

    const keys = new Set(catalogItem.filterKeys);
    const schools = await this.loadScopedSchools(reportId, user);
    const options: ReportFilterOptionsDto = { reportId, schools };

    if (keys.has('modality')) {
      options.modalities = enumOptions(Object.values(Modality), modalityLabel);
    }
    if (keys.has('priority')) {
      options.priorities = enumOptions(Object.values(Priority), priorityLabel);
    }
    if (keys.has('slaStatus')) {
      options.slaStatuses = enumOptions(Object.values(SlaStatus), slaStatusLabel);
    }
    if (keys.has('projectStatus')) {
      options.projectStatuses = enumOptions(Object.values(ProjectStatus), projectStatusLabel);
    }
    if (keys.has('institutionalState')) {
      options.institutionalStates = enumOptions(
        Object.values(ProjectInstitutionalState),
        projectInstitutionalStateLabel,
      );
    }
    if (keys.has('operationalState')) {
      options.operationalStates = Object.entries(INSTITUTIONAL_STATE_LABELS)
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es'));
    }
    if (keys.has('status')) {
      options.observationStatuses = enumOptions(
        Object.values(ObservationStatus),
        observationStatusLabel,
      );
    }
    if (keys.has('factoryProductionStatus')) {
      options.factoryProductionStatuses = enumOptions(
        Object.values(FactoryProductionStatus),
        factoryProductionStatusLabel,
      );
    }
    if (keys.has('radicationStatus')) {
      options.radicationStatuses = enumOptions(
        Object.values(ProjectRadicationStatus),
        radicationStatusLabel,
      );
    }
    if (keys.has('hasRadicationNumber')) {
      options.hasRadicationOptions = [
        { value: 'true', label: 'Con número' },
        { value: 'false', label: 'Sin número' },
      ];
    }
    if (keys.has('projectId') && reportId === ReportId.RADICATIONS) {
      options.radicatedPrograms = await this.loadRadicatedPrograms(user);
    }

    return options;
  }

  async resolveProjectFilterLabel(projectId: string, user: UserEntity): Promise<string> {
    const qb = this.projectRepo
      .createQueryBuilder('project')
      .select(['project.id', 'project.program', 'project.school', 'project.radicationNumber'])
      .where('project.id = :projectId', { projectId });
    this.policy.applyProjectScope(qb, user);
    const project = await qb.getOne();
    if (!project) return projectId;
    const radication = project.radicationNumber ? ` — Nº ${project.radicationNumber}` : '';
    return `${project.program} — ${project.school}${radication}`;
  }

  private async loadScopedSchools(reportId: ReportId, user: UserEntity): Promise<ReportFilterOptionDto[]> {
    if (reportId === ReportId.FACTORY_PRODUCTION || reportId === ReportId.SLA_COMPLIANCE) {
      const qb = this.semesterRepo
        .createQueryBuilder('semester')
        .innerJoin('semester.project', 'project')
        .select('DISTINCT project.school', 'school')
        .where('semester.deletedAt IS NULL');
      this.policy.applyProjectScope(qb, user, 'project');
      this.policy.applySemesterScope(qb, user, 'project', 'semester');
      const rows = await qb.orderBy('project.school', 'ASC').getRawMany<{ school: string }>();
      return rows.filter((r) => r.school).map((r) => ({ value: r.school, label: r.school }));
    }

    const qb = this.projectRepo
      .createQueryBuilder('project')
      .select('DISTINCT project.school', 'school')
      .where('project.deletedAt IS NULL');
    this.policy.applyProjectScope(qb, user);
    const rows = await qb.orderBy('project.school', 'ASC').getRawMany<{ school: string }>();
    return rows.filter((r) => r.school).map((r) => ({ value: r.school, label: r.school }));
  }

  private async loadRadicatedPrograms(
    user: UserEntity,
  ): Promise<ReportRadicatedProgramOptionDto[]> {
    const qb = this.projectRepo
      .createQueryBuilder('project')
      .select([
        'project.id',
        'project.program',
        'project.school',
        'project.radicationNumber',
      ])
      .where('project.deletedAt IS NULL')
      .andWhere('project.radicationNumber IS NOT NULL')
      .andWhere("TRIM(project.radicationNumber) <> ''");
    this.policy.applyProjectScope(qb, user);
    qb.orderBy('project.program', 'ASC').addOrderBy('project.school', 'ASC');

    const projects = await qb.getMany();
    return projects.map((p) => ({
      projectId: p.id,
      program: p.program,
      school: p.school,
      radicationNumber: p.radicationNumber ?? '',
      label: `${p.program} — ${p.school} — Nº ${p.radicationNumber}`,
    }));
  }

  async searchSuggestions(
    reportId: ReportId,
    query: string,
    user: UserEntity,
    limit = 8,
  ): Promise<ReportSearchSuggestionDto[]> {
    this.policy.assertReportAccess(reportId, user);
    const term = query.trim();
    if (term.length < 2) return [];

    const qb = this.projectRepo
      .createQueryBuilder('project')
      .select([
        'project.id',
        'project.program',
        'project.school',
        'project.radicationNumber',
      ])
      .where('project.deletedAt IS NULL');
    this.policy.applyProjectScope(qb, user);

    const like = `%${term.toLowerCase()}%`;
    qb.andWhere(
      new Brackets((sub) => {
        sub
          .where('LOWER(project.program) LIKE :like', { like })
          .orWhere('LOWER(project.school) LIKE :like', { like })
          .orWhere('LOWER(COALESCE(project.radicationNumber, \'\')) LIKE :like', { like });
      }),
    );
    qb.orderBy('project.program', 'ASC').take(Math.min(limit, 12));

    const projects = await qb.getMany();
    return projects.map((p) => {
      const hasRadication = Boolean(p.radicationNumber?.trim());
      const radSuffix = hasRadication ? ` · Nº ${p.radicationNumber}` : '';
      return {
        projectId: p.id,
        label: p.program,
        subtitle: `${p.school}${radSuffix}`,
        radicationNumber: p.radicationNumber ?? undefined,
        hasRadication,
      };
    });
  }
}
