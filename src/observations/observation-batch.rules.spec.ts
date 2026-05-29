import { ObservationNotificationStatus } from '../common/enums/observation-notification-status.enum';
import { ObservationStatus } from '../common/enums/observation-status.enum';
import { isFactoryVisibleUnresolvedObservation } from './observation-visibility.rules';

describe('observation notification batch rules', () => {
  it('treats ABIERTA as blocking only when notification was sent', () => {
    const blocking = (status: ObservationStatus, notificationStatus: ObservationNotificationStatus) =>
      status === ObservationStatus.ABIERTA && notificationStatus === ObservationNotificationStatus.SENT;

    expect(blocking(ObservationStatus.ABIERTA, ObservationNotificationStatus.PENDING)).toBe(false);
    expect(blocking(ObservationStatus.ABIERTA, ObservationNotificationStatus.SENT)).toBe(true);
    expect(blocking(ObservationStatus.EN_CORRECCION, ObservationNotificationStatus.SENT)).toBe(false);
  });

  it('hides Product drafts from factory unresolved counts until batch send', () => {
    expect(
      isFactoryVisibleUnresolvedObservation(
        ObservationStatus.ABIERTA,
        ObservationNotificationStatus.PENDING,
      ),
    ).toBe(false);
    expect(
      isFactoryVisibleUnresolvedObservation(
        ObservationStatus.ABIERTA,
        ObservationNotificationStatus.SENT,
      ),
    ).toBe(true);
    expect(
      isFactoryVisibleUnresolvedObservation(
        ObservationStatus.EN_CORRECCION,
        ObservationNotificationStatus.PENDING,
      ),
    ).toBe(true);
    expect(
      isFactoryVisibleUnresolvedObservation(
        ObservationStatus.RESUELTA,
        ObservationNotificationStatus.SENT,
      ),
    ).toBe(false);
  });
});
