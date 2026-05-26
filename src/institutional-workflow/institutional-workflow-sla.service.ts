import { Injectable } from '@nestjs/common';
import { FACTORY_DELIVERY_BUSINESS_DAYS } from '../common/constants/factory-delivery.constants';
import { InstitutionalOperationalState } from '../common/enums/institutional-operational-state.enum';
import { SlaStatus } from '../common/enums/sla-status.enum';
import { addBusinessDays } from '../common/utils/business-days.util';

@Injectable()
export class InstitutionalWorkflowSlaService {
  private productReviewDays(): number {
    const raw = process.env.PRODUCT_ACADEMIC_REVIEW_BUSINESS_DAYS;
    const n = raw ? Number(raw) : 5;
    return Number.isInteger(n) && n > 0 ? n : 5;
  }

  businessDaysForState(state: InstitutionalOperationalState): number {
    switch (state) {
      case InstitutionalOperationalState.PENDING_PLANNING_INITIAL_VALIDATION:
      case InstitutionalOperationalState.RETURNED_TO_PRODUCT_FROM_PLANNING:
        return 1;
      case InstitutionalOperationalState.PENDING_FACTORY:
      case InstitutionalOperationalState.IN_FACTORY_PRODUCTION:
      case InstitutionalOperationalState.RETURNED_TO_FACTORY_FROM_PLANNING:
      case InstitutionalOperationalState.CHANGES_REQUESTED_BY_PRODUCT:
        return FACTORY_DELIVERY_BUSINESS_DAYS;
      case InstitutionalOperationalState.PENDING_PLANNING_PRODUCTION_VALIDATION:
        return 1;
      case InstitutionalOperationalState.PENDING_LMS_UPLOAD:
      case InstitutionalOperationalState.IN_LMS_UPLOAD:
      case InstitutionalOperationalState.RETURNED_TO_LMS_FROM_PLANNING:
        return 8;
      case InstitutionalOperationalState.PENDING_PLANNING_LMS_VALIDATION:
        return 1;
      case InstitutionalOperationalState.PENDING_PRODUCT_ACADEMIC_REVIEW:
      case InstitutionalOperationalState.IN_PRODUCT_ACADEMIC_REVIEW:
        return this.productReviewDays();
      case InstitutionalOperationalState.PENDING_PROJECT_RADICATION:
        return 1;
      default:
        return 1;
    }
  }

  computeStageDueAt(enteredAt: Date, state: InstitutionalOperationalState): Date {
    return addBusinessDays(enteredAt, this.businessDaysForState(state));
  }

  computeSlaStatus(params: {
    state: InstitutionalOperationalState;
    stageEnteredAt: Date;
    stageDueAt: Date | null;
    finalizedAt: Date | null;
    now?: Date;
  }): SlaStatus {
    const now = params.now ?? new Date();
    if (params.state === InstitutionalOperationalState.FINALIZED) {
      const due = params.stageDueAt ?? params.finalizedAt;
      if (!due || !params.finalizedAt) return SlaStatus.FINALIZED_ON_TIME;
      return params.finalizedAt > due ? SlaStatus.FINALIZED_OVERDUE : SlaStatus.FINALIZED_ON_TIME;
    }
    const due = params.stageDueAt;
    if (!due) return SlaStatus.ON_TIME;
    if (now > due) return SlaStatus.OVERDUE;
    const totalMs = due.getTime() - params.stageEnteredAt.getTime();
    const remainingMs = due.getTime() - now.getTime();
    if (totalMs > 0 && remainingMs / totalMs < 0.2) return SlaStatus.AT_RISK;
    return SlaStatus.ON_TIME;
  }

  consumedBusinessDays(enteredAt: Date, exitedAt: Date): number {
    let count = 0;
    const cursor = new Date(enteredAt);
    while (cursor < exitedAt) {
      cursor.setDate(cursor.getDate() + 1);
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) count += 1;
    }
    return count;
  }
}
