import { ObservationNotificationStatus } from '../common/enums/observation-notification-status.enum';
import { ObservationStatus } from '../common/enums/observation-status.enum';

/** ABIERTA solo bloquea a Fábrica cuando Product ya envió el lote (notificationStatus = SENT). */
export function isFactoryVisibleUnresolvedObservation(
  status: ObservationStatus,
  notificationStatus: ObservationNotificationStatus,
): boolean {
  if (status === ObservationStatus.RESUELTA) return false;
  if (status === ObservationStatus.ABIERTA && notificationStatus === ObservationNotificationStatus.PENDING) {
    return false;
  }
  return true;
}
