/**
 * Zone names seen in podcast feeds, as minutes east of UTC. Date.parse knows
 * only the RFC 822 ones (UT, GMT and the North American zones). IST is left
 * out on purpose: it means India, Ireland or Israel.
 */
const ZONE_OFFSET_MINUTES: Record<string, number> = {
  ut: 0, utc: 0, gmt: 0, z: 0,
  est: -300, edt: -240, cst: -360, cdt: -300,
  mst: -420, mdt: -360, pst: -480, pdt: -420,
  akst: -540, akdt: -480, hst: -600,
  ast: -240, adt: -180, nst: -210, ndt: -150,
  wet: 0, west: 60, bst: 60, cet: 60, cest: 120, eet: 120, eest: 180, msk: 180,
  jst: 540, kst: 540, hkt: 480, sgt: 480,
  awst: 480, acst: 570, acdt: 630, aest: 600, aedt: 660, nzst: 720, nzdt: 780,
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// [weekday,] day month year hh:mm[:ss] [zone]
const RFC_2822 =
  /^(?:[a-z]+,?\s*)?(\d{1,2})\s+([a-z]{3,})\.?\s+(\d{4}|\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([+-]\d{2}:?\d{2}|[a-z]+))?$/i;

const ISO_8601 =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*(z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** A zone Date.parse recognises, so its fallback result is not machine-local time. */
const KNOWN_ZONE = /\b(?:gmt|utc?|z|[ecmp][sd]t)\b|[+-]\d{2}:?\d{2}\b/i;

/**
 * Parse a feed date into an ISO 8601 string, or null if it is not a real date.
 *
 * RSS pubDate is RFC 822 (in practice RFC 2822), whose zone may be a name
 * Date.parse rejects, such as BST. As RFC 2822 says, an unknown zone name, or
 * none, counts as UTC, so the result never depends on the machine's time zone.
 */
export function parseFeedDate(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;

  const rfc = RFC_2822.exec(trimmed);
  if (rfc && !/^[ap]m$/i.test(rfc[7] ?? '')) {
    const [, day, monthName, year, hour, minute, second = '0', zone] = rfc;
    const month = MONTHS.indexOf(monthName.slice(0, 3).toLowerCase());
    if (month === -1) return null;
    // RFC 2822 obsolete syntax: 00-49 is 2000-2049, 50-99 is 1950-1999.
    const fullYear = year.length === 2 ? Number(year) + (Number(year) < 50 ? 2000 : 1900) : Number(year);
    return toIso(fullYear, month, day, hour, minute, second, '0', zoneOffsetMinutes(zone));
  }

  const iso = ISO_8601.exec(trimmed);
  if (iso) {
    const [, year, month, day, hour = '0', minute = '0', second = '0', fraction = '0', zone] = iso;
    const ms = fraction.padEnd(3, '0').slice(0, 3);
    return toIso(Number(year), Number(month) - 1, day, hour, minute, second, ms, zoneOffsetMinutes(zone));
  }

  // Anything else, such as Date#toString output, as the platform reads it.
  const date = new Date(trimmed);
  if (isNaN(date.getTime())) return null;
  if (KNOWN_ZONE.test(trimmed)) return date.toISOString();
  // No zone: the platform read it as local time. Keep the wall-clock time, as UTC.
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();
}

function zoneOffsetMinutes(zone: string | undefined): number {
  if (!zone) return 0;
  const offset = /^([+-])(\d{2}):?(\d{2})?$/.exec(zone);
  if (offset) {
    const [, sign, hours, minutes = '0'] = offset;
    return (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes));
  }
  return ZONE_OFFSET_MINUTES[zone.toLowerCase()] ?? 0;
}

/** Build the instant, or null if any field is out of range (31 Feb, 25:00). */
function toIso(
  year: number,
  month: number,
  day: string,
  hour: string,
  minute: string,
  second: string,
  millisecond: string,
  offsetMinutes: number,
): string | null {
  const [d, h, m, s, ms] = [day, hour, minute, second, millisecond].map(Number);
  if (month < 0 || month > 11 || h > 23 || m > 59 || s > 60) return null;
  const wallClock = new Date(Date.UTC(year, month, d, h, m, s, ms));
  if (wallClock.getUTCMonth() !== month || wallClock.getUTCDate() !== d) return null;
  return new Date(wallClock.getTime() - offsetMinutes * 60_000).toISOString();
}
