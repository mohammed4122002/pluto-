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

/** Every formatter below takes an optional trailing IANA zone name
 * ("Asia/Amman"). Omitted, `Intl` falls back to the browser's own zone --
 * fine for an event that happened to the viewer (a message arrived, a
 * setting was saved), wrong for a time that happened at the clinic. A
 * confirmed appointment is scheduled_at a specific branch regardless of
 * which timezone the staff member reviewing it happens to be sitting in:
 * confirmed live, a booking correctly stored (and correctly relayed to the
 * patient) as 13:00 Asia/Amman rendered as 12:00 on the appointments table,
 * because the browser viewing it was one zone off from the branch. Pass the
 * branch's own timezone (see branchTimeZoneMap) for anything that
 * represents a real-world appointment/slot/visit time; leave it out for
 * timestamps that are genuinely about the viewer's own session. */
type TimeZoneOpt = string | undefined;

/** 09:00 ص */
export function formatTime(iso: string | Date, timeZone?: TimeZoneOpt): string {
  return new Date(iso).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone });
}

/** ١٠ آب ٢٠٢٦ */
export function formatDate(iso: string | Date, timeZone?: TimeZoneOpt): string {
  return new Date(iso).toLocaleDateString(LOCALE, { year: "numeric", month: "long", day: "numeric", timeZone });
}

/** ١٠ آب — no year, for ranges and labels where it is already implied. */
export function formatDayMonth(iso: string | Date, timeZone?: TimeZoneOpt): string {
  return new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "long", timeZone });
}

/** الإثنين، ١٠ آب ٢٠٢٦ */
export function formatFullDate(iso: string | Date, timeZone?: TimeZoneOpt): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone,
  });
}

/** ١٠ آب ٢٠٢٦، ٩:٠٠ ص */
export function formatDateTime(iso: string | Date, timeZone?: TimeZoneOpt): string {
  return new Date(iso).toLocaleString(LOCALE, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

/* Compact variants for dense table cells, where the long month name wraps a
   single value across three lines. Prose contexts ("آخر تحديث: ...") keep the
   long form above. */

/** ٥‏/٨‏/٢٠٢٦ */
export function formatDateShort(iso: string | Date, timeZone?: TimeZoneOpt): string {
  return new Date(iso).toLocaleDateString(LOCALE, { dateStyle: "short", timeZone });
}

/** ٥‏/٨‏/٢٠٢٦، ٩:٠٠ ص */
export function formatDateTimeShort(iso: string | Date, timeZone?: TimeZoneOpt): string {
  return new Date(iso).toLocaleString(LOCALE, { dateStyle: "short", timeStyle: "short", timeZone });
}

/** branch id -> IANA timezone, for passing into the formatters above.
 * Built from whatever branch list a page already has in scope -- no extra
 * fetch of its own. */
export function branchTimeZoneMap(branches: { id: string; timezone: string }[]): Record<string, string> {
  return Object.fromEntries(branches.map((b) => [b.id, b.timezone]));
}
