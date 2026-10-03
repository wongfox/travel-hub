/**
 * Formats a "local Peru time" wall-clock string (design Decision 14: trip
 * times are local Peru times, formatted via `Intl.DateTimeFormat` pinned to
 * `America/Lima`) for display, without letting the *viewer's own device
 * timezone* shift the displayed value.
 *
 * `departureLocal`/`arrivalLocal`/`nextMilestone.atLocal` (design-interfaces
 * `TripDTO`) are naive wall-clock strings with no offset. Passing one
 * directly to `new Date(...)` would make the browser interpret it in the
 * *viewer's* timezone, then formatting with `timeZone: "America/Lima"` would
 * shift it a second time — silently wrong for any viewer not already in
 * Peru. Instead, the naive components are treated as UTC (appending `Z` if
 * missing) and formatted back out with `timeZone: "UTC"`, so the exact same
 * `YYYY-MM-DD HH:mm` the server sent is what's displayed, regardless of the
 * viewer's device timezone.
 *
 * A trailing `Z` or numeric offset (`-05:00`, as the seeded SIR data carries)
 * is dropped first: the wall-clock components are what the server meant,
 * and appending `Z` to a string that already has an offset is an Invalid Date.
 */
export function formatLocalDateTime(isoLocal: string, locale: string): string {
  const date = parseLocalWallClock(isoLocal);

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

/** Parses a "local Peru time" string into a `Date` whose UTC fields equal its wall-clock fields. */
export function parseLocalWallClock(isoLocal: string): Date {
  return new Date(`${isoLocal.replace(/(Z|[+-]\d{2}:\d{2})$/, "")}Z`);
}
