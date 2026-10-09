import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseFeedDate } from '../../src/utils/feed-date.js';

describe('parseFeedDate', () => {
  beforeEach(() => {
    // Auckland is UTC+13 in January, so any date read as local time would come out wrong.
    vi.stubEnv('TZ', 'Pacific/Auckland');
    expect(new Date(2024, 0, 1).getTimezoneOffset()).toBe(-780);
    return () => vi.unstubAllEnvs();
  });

  it.each([
    ['Mon, 01 Jan 2024 10:00:00 GMT', '2024-01-01T10:00:00.000Z'],
    ['Mon, 01 Jan 2024 10:00:00 UT', '2024-01-01T10:00:00.000Z'],
    ['Mon, 01 Jan 2024 10:00:00 EST', '2024-01-01T15:00:00.000Z'],
    ['Mon, 01 Jul 2024 10:00:00 PDT', '2024-07-01T17:00:00.000Z'],
    ['Mon, 01 Jan 2024 10:00:00 +0530', '2024-01-01T04:30:00.000Z'],
    ['Mon, 01 Jan 2024 10:00:00 -0000', '2024-01-01T10:00:00.000Z'],
  ])('reads the RFC 822 date %j as %s', (text, iso) => {
    expect(parseFeedDate(text)).toBe(iso);
  });

  it.each([
    ['Mon, 01 Jul 2024 10:00:00 BST', '2024-07-01T09:00:00.000Z'],
    ['Mon, 01 Jan 2024 10:00:00 CET', '2024-01-01T09:00:00.000Z'],
    ['Mon, 01 Jul 2024 10:00:00 CEST', '2024-07-01T08:00:00.000Z'],
    ['Mon, 01 Jul 2024 10:00:00 EEST', '2024-07-01T07:00:00.000Z'],
    ['Mon, 01 Jul 2024 10:00:00 MSK', '2024-07-01T07:00:00.000Z'],
    ['Mon, 01 Jan 2024 10:00:00 JST', '2024-01-01T01:00:00.000Z'],
    ['Mon, 01 Jul 2024 10:00:00 AEST', '2024-07-01T00:00:00.000Z'],
    ['Mon, 01 Jan 2024 10:00:00 AEDT', '2023-12-31T23:00:00.000Z'],
    ['Mon, 01 Jan 2024 10:00:00 ACDT', '2023-12-31T23:30:00.000Z'],
    ['Mon, 01 Jan 2024 10:00:00 NZDT', '2023-12-31T21:00:00.000Z'],
    ['Mon, 01 Jan 2024 10:00:00 AKST', '2024-01-01T19:00:00.000Z'],
    ['Mon, 01 Jan 2024 10:00:00 HST', '2024-01-01T20:00:00.000Z'],
    ['Mon, 01 Jan 2024 10:00:00 NST', '2024-01-01T13:30:00.000Z'],
  ])('reads the zone abbreviation in %j as %s', (text, iso) => {
    expect(parseFeedDate(text)).toBe(iso);
  });

  it.each([
    ['an unknown zone name', 'Mon, 01 Jan 2024 10:00:00 XYZT'],
    ['an ambiguous zone name (IST is India, Ireland or Israel)', 'Mon, 01 Jan 2024 10:00:00 IST'],
    ['a military zone letter', 'Mon, 01 Jan 2024 10:00:00 M'],
    ['a zone word that names a built-in object property', 'Mon, 01 Jan 2024 10:00:00 constructor'],
    ['no zone at all', 'Mon, 01 Jan 2024 10:00:00'],
  ])('reads %s as UTC, as RFC 2822 says, never as machine-local time', (_case, text) => {
    expect(parseFeedDate(text)).toBe('2024-01-01T10:00:00.000Z');
  });

  it.each([
    ['without a weekday or seconds', '1 Jan 2024 10:00 GMT', '2024-01-01T10:00:00.000Z'],
    ['with full day and month names', 'Monday, 01 January 2024 10:00:00 GMT', '2024-01-01T10:00:00.000Z'],
    ['with a two-digit year', 'Mon, 01 Jan 24 10:00:00 GMT', '2024-01-01T10:00:00.000Z'],
    ['with a 12-hour clock', 'Mon, 01 Jan 2024 10:00:00 PM EST', '2024-01-02T03:00:00.000Z'],
    ['as ISO 8601 with an offset', '2024-01-01T10:00:00+02:00', '2024-01-01T08:00:00.000Z'],
    ['as ISO 8601 without a zone', '2024-01-01T10:00:00', '2024-01-01T10:00:00.000Z'],
    ['as an ISO 8601 day', '2024-01-01', '2024-01-01T00:00:00.000Z'],
    ['as JavaScript Date#toString output', 'Mon Jan 01 2024 10:00:00 GMT+0200 (Eastern European Standard Time)', '2024-01-01T08:00:00.000Z'],
    ['in a loose US style with no zone', 'January 1, 2024 10:00', '2024-01-01T10:00:00.000Z'],
    ['with dashes before the year and no zone', '01-Jan-2024 10:00:00', '2024-01-01T10:00:00.000Z'],
    ['as dashed numbers with no zone', '01-01-2024 10:00', '2024-01-01T10:00:00.000Z'],
    ['with an hours-only offset', 'Mon, 01 Jan 2024 10:00:00 +05', '2024-01-01T05:00:00.000Z'],
  ])('reads a date %s', (_case, text, iso) => {
    expect(parseFeedDate(text)).toBe(iso);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a date', 'sometime last week'],
    ['a day that does not exist', 'Sat, 31 Feb 2024 10:00:00 GMT'],
    ['an hour that does not exist', 'Mon, 01 Jan 2024 25:00:00 GMT'],
  ])('returns null when the date is %s', (_case, text) => {
    expect(parseFeedDate(text)).toBeNull();
  });
});
