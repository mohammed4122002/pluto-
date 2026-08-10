/** Date and time formatting for the whole UI.
 *
 * These were spread across 25 call sites split between the "ar" and "ar-JO"
 * locales, which are not cosmetically equivalent: "ar" produces the Egyptian
 * month names (أغسطس، يناير) while "ar-JO" produces the Levantine ones
 * (آب، كانون الثاني). The same day therefore read as "١٠ أغسطس" on the
 * doctor's screen and "١٠ آب" on the dashboard.
 *
 * A clinic delivered per client may also want a different locale entirely, so
 * this is the single place to change it. */
export const LOCALE = "ar-JO";

/** 09:00 ص */
export function formatTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
}

/** ١٠ آب ٢٠٢٦ */
export function formatDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(LOCALE, { year: "numeric", month: "long", day: "numeric" });
}

/** ١٠ آب — no year, for ranges and labels where it is already implied. */
export function formatDayMonth(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "long" });
}

/** الإثنين، ١٠ آب ٢٠٢٦ */
export function formatFullDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** ١٠ آب ٢٠٢٦، ٩:٠٠ ص */
export function formatDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString(LOCALE, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* Compact variants for dense table cells, where the long month name wraps a
   single value across three lines. Prose contexts ("آخر تحديث: ...") keep the
   long form above. */

/** ٥‏/٨‏/٢٠٢٦ */
export function formatDateShort(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(LOCALE, { dateStyle: "short" });
}

/** ٥‏/٨‏/٢٠٢٦، ٩:٠٠ ص */
export function formatDateTimeShort(iso: string | Date): string {
  return new Date(iso).toLocaleString(LOCALE, { dateStyle: "short", timeStyle: "short" });
}
