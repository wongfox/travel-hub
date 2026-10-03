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
 */
export function formatLocalDateTime(isoLocal: string, locale: string): string {
  const asUtc = isoLocal.endsWith("Z") ? isoLocal : `${isoLocal}Z`;
  const date = new Date(asUtc);

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}
