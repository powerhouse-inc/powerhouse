import { formatInTimeZone } from "date-fns-tz/formatInTimeZone";

export function formatDateForDisplay(date: Date | string, displayTime = true) {
  const formatString = displayTime ? "yyyy/MM/dd, HH:mm:ss zzz" : "yyyy/MM/dd";
  return formatInTimeZone(date, getTimeZone(), formatString);
}

export function isISODate(str: string) {
  if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(str)) return false;
  const d = new Date(str);
  return d instanceof Date && !isNaN(d.getTime()) && d.toISOString() === str;
}

export function getTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function isoDateStringToDateInput(
  isoDateString: string,
  withTime = false,
) {
  const format = withTime ? "yyyy-MM-dd'T'HH:mm:ss.SSS" : "yyyy-MM-dd";
  const timeZone = getTimeZone();
  return formatInTimeZone(isoDateString, timeZone, format);
}
