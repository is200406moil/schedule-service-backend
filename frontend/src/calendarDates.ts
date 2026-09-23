const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const RUSSIAN_MONTH = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", month: "long" });
const MIN_CALENDAR_YEAR = 1900;
const MAX_CALENDAR_YEAR = 2100;
const MIN_CALENDAR_MONTH = MIN_CALENDAR_YEAR * 12;
const MAX_CALENDAR_MONTH = MAX_CALENDAR_YEAR * 12 + 11;

function utcDate(year: number, month: number, day: number): Date {
  const value = new Date(0);
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCFullYear(year, month - 1, day);
  return value;
}

function dateKey(value: Date): string {
  const year = value.getUTCFullYear();
  if (year < 1 || year > 9999) throw new RangeError("Date is outside the calendar range");
  return `${String(year).padStart(4, "0")}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function validDateKey(value: string | null): value is string {
  const match = value?.match(DATE_KEY);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = utcDate(year, month, day);
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function isSelectableCalendarDate(value: string | null): value is string {
  return validDateKey(value)
    && Number(value.slice(0, 4)) >= MIN_CALENDAR_YEAR
    && Number(value.slice(0, 4)) <= MAX_CALENDAR_YEAR;
}

export function parseCalendarDate(value: string | null, fallback: string): string {
  if (isSelectableCalendarDate(value)) return value;
  if (isSelectableCalendarDate(fallback)) return fallback;
  throw new RangeError("Invalid fallback calendar date");
}

function monthStart(monthKey: string): string {
  if (!isSelectableCalendarDate(monthKey)) throw new RangeError("Invalid calendar month");
  return `${monthKey.slice(0, 7)}-01`;
}

export function monthDates(monthKey: string): string[] {
  const first = monthStart(monthKey);
  const start = utcDate(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 1);
  const mondayOffset = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return dateKey(day);
  });
}

export function shiftMonth(monthKey: string, delta: number): string {
  const first = monthStart(monthKey);
  if (!Number.isInteger(delta)) throw new RangeError("Month shift must be an integer");
  const year = Number(first.slice(0, 4));
  const month = Number(first.slice(5, 7));
  const absoluteMonth = Math.min(MAX_CALENDAR_MONTH, Math.max(MIN_CALENDAR_MONTH, year * 12 + month - 1 + delta));
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = absoluteMonth % 12 + 1;
  return `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-01`;
}

export function monthLabel(monthKey: string): string {
  const first = monthStart(monthKey);
  const month = RUSSIAN_MONTH.format(utcDate(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 1));
  return `${month[0].toLocaleUpperCase("ru-RU")}${month.slice(1)} ${first.slice(0, 4)}`;
}

export function moscowTime(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}
