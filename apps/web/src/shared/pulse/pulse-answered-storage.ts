/**
 * Client-side "already answered" tracking (task 11.6): the design's HTTP
 * surface has no `GET` status endpoint for pulse responses (only `POST
 * /api/pulse`), so the web feature cannot ask the server whether this
 * passenger already answered a given leg. `localStorage`, scoped per
 * `(linkId, legId)`, is the only source of that fact client-side — the
 * server's own `pulse_response` unique constraint (task 11.4) remains the
 * authoritative guard against a double-recorded response either way.
 */
function storageKey(linkId: string, legId: string): string {
  return `pulse-answered:${linkId}:${legId}`;
}

export function hasAnsweredPulseLocally(linkId: string, legId: string): boolean {
  return window.localStorage.getItem(storageKey(linkId, legId)) === "true";
}

export function markPulseAnsweredLocally(linkId: string, legId: string): void {
  window.localStorage.setItem(storageKey(linkId, legId), "true");
}
