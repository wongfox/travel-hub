import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type { ApiClient } from "../api/client.js";
import { submitPulseResponse } from "./get-pulse.js";

/**
 * TanStack Query mutation hook (design Decision 1) backing the `pulse`
 * feature's response submission (task 11.6), matching
 * `shared/wifi/use-wifi-queries.ts`'s convention.
 */
export function useSubmitPulseResponseMutation(
  apiClient: ApiClient,
): UseMutationResult<{ status: string }, Error, { legId: string; score: number }> {
  return useMutation({
    mutationFn: ({ legId, score }) => submitPulseResponse(apiClient, { legId, score }),
  });
}
