export interface KillSwitchResponseBody {
  killed: boolean;
}

export interface KillSwitchDeps {
  fetchImpl: typeof fetch;
  cachesImpl: Pick<CacheStorage, "keys" | "delete">;
  unregister: () => Promise<boolean>;
}

/**
 * Remote-kill check (design Migration/Rollout item 5): on activation, the
 * service worker fetches `/sw-kill.json`. When it reports `killed: true`,
 * every Cache Storage bucket is cleared and the service worker unregisters
 * itself — a bad deploy (or a decommissioned app) can be remotely switched
 * off without waiting on a normal update cycle. A network failure, a
 * non-ok response, or a malformed body all fail OPEN (treated as not
 * killed), so a transient outage never bricks the app for every passenger
 * at once.
 */
export async function checkRemoteKill(deps: KillSwitchDeps): Promise<boolean> {
  let response: Response;
  try {
    response = await deps.fetchImpl("/sw-kill.json", { cache: "no-store" });
  } catch {
    return false;
  }

  if (!response.ok) {
    return false;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return false;
  }

  const killed =
    typeof body === "object" &&
    body !== null &&
    "killed" in body &&
    (body as KillSwitchResponseBody).killed === true;

  if (!killed) {
    return false;
  }

  const cacheKeys = await deps.cachesImpl.keys();
  await Promise.all(cacheKeys.map((key) => deps.cachesImpl.delete(key)));
  await deps.unregister();

  return true;
}
