export interface AddBusinessDaysOptions {
  /** Festivos (solo fecha, sin hora). Reservado para calendario Colombia. */
  holidays?: Date[];
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isHoliday(date: Date, holidays?: Date[]): boolean {
  if (!holidays?.length) return false;
  const key = toDateKey(date);
  return holidays.some((holiday) => toDateKey(holiday) === key);
}

function isBusinessDay(date: Date, holidays?: Date[]): boolean {
  return !isWeekend(date) && !isHoliday(date, holidays);
}

/**
 * Suma días hábiles (lunes a viernes) a partir de startDate.
 * No cuenta festivos de Colombia por defecto; use options.holidays cuando estén disponibles.
 */
export function addBusinessDays(
  startDate: Date,
  businessDays: number,
  options?: AddBusinessDaysOptions,
): Date {
  if (businessDays <= 0) {
    return new Date(startDate);
  }

  const result = new Date(startDate);
  let remaining = businessDays;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result, options?.holidays)) {
      remaining -= 1;
    }
  }

  return result;
}
