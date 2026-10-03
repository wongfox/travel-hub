import type { Locale } from "contracts";
import type { ApiClient } from "../../shared/api/client.js";

export interface RequestRelinkInput {
  reservationRef: string;
  surname: string;
  locale: Locale;
}

/**
 * Calls `POST /api/links/reissue` (task 5.4). Deliberately returns `void`
 * on success regardless of whether the server matched a reservation — the
 * server's own response is uniform (`202` either way, spec "Re-request
 * with non-matching inputs"), so this wrapper must never expose a
 * match/no-match distinction to its caller either.
 */
export async function requestRelink(apiClient: ApiClient, input: RequestRelinkInput): Promise<void> {
  await apiClient.post("/api/links/reissue", input);
}
