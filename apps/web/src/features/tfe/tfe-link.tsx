import type { ReactNode } from "react";
import { ButtonLink } from "../../shared/ui/atoms/button.js";
import { Icon } from "../../shared/ui/atoms/icon.js";

export interface TfeLinkProps {
  /** Must match one of the BFF's allowlisted placements (`outbound/resolve-tfe-redirect.ts`); an unknown value 400s instead of redirecting. */
  placement: string;
  children: ReactNode;
}

/**
 * `complementary-services-redirect`'s web trigger (task 10.5): a plain link
 * to the allowlisted BFF redirect (`GET /api/out/tfe?placement=`) — the
 * actual destination/attribution resolution and the open-redirect-safety
 * check live entirely server-side (`modules/outbound/*`); this component
 * only ever names a `placement` key, never a URL. Click-out event emission
 * into `AnalyticsSinkPort` is wired in task 12.2, per the design's own
 * "wired fully in 12.2" note.
 */
export function TfeLink({ placement, children }: TfeLinkProps) {
  return (
    <ButtonLink variant="secondary" block href={`/api/out/tfe?placement=${encodeURIComponent(placement)}`}>
      {children}
      <Icon name="external" size={18} />
    </ButtonLink>
  );
}
