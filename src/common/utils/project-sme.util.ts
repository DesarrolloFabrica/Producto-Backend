import { FACTORY_DELIVERY_BUSINESS_DAYS } from '../constants/factory-delivery.constants';
import { ProjectStatus } from '../enums/project-status.enum';
import { SubjectMatterExpertStatus } from '../enums/subject-matter-expert-status.enum';
import { addBusinessDays } from './business-days.util';

export interface ProjectActivationPlan {
  subjectMatterExpertStatus: SubjectMatterExpertStatus;
  activatedAt: Date | null;
  expertConfirmedAt: Date | null;
  expectedDeliveryDate: Date | null;
  status: ProjectStatus;
  shouldNotifyFactory: boolean;
}

export function isProjectActiveForFactory(
  subjectMatterExpertStatus: SubjectMatterExpertStatus,
): boolean {
  return subjectMatterExpertStatus === SubjectMatterExpertStatus.READY;
}

export function resolveActivationOnCreate(
  expectedDeliveryDate: Date,
  referenceDate: Date = new Date(),
): ProjectActivationPlan {
  return {
    subjectMatterExpertStatus: SubjectMatterExpertStatus.READY,
    activatedAt: referenceDate,
    expertConfirmedAt: referenceDate,
    expectedDeliveryDate,
    status: ProjectStatus.READY_FOR_PRODUCTION,
    shouldNotifyFactory: true,
  };
}

export function resolveActivationOnExpertConfirm(
  referenceDate: Date = new Date(),
): Pick<
  ProjectActivationPlan,
  | 'subjectMatterExpertStatus'
  | 'activatedAt'
  | 'expertConfirmedAt'
  | 'expectedDeliveryDate'
  | 'status'
  | 'shouldNotifyFactory'
> {
  return {
    subjectMatterExpertStatus: SubjectMatterExpertStatus.READY,
    activatedAt: referenceDate,
    expertConfirmedAt: referenceDate,
    expectedDeliveryDate: addBusinessDays(referenceDate, FACTORY_DELIVERY_BUSINESS_DAYS),
    status: ProjectStatus.READY_FOR_PRODUCTION,
    shouldNotifyFactory: true,
  };
}
