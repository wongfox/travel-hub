import { useTranslation } from "react-i18next";
import type { ServiceTier } from "contracts";
import { Badge } from "../atoms/badge.js";

const TIER_LABEL_KEYS: Record<ServiceTier, string> = {
  VOYAGER: "tier.voyager",
  VISTADOME_360: "tier.vistadome360",
  PRIME: "tier.prime",
  FIRST_CLASS: "tier.firstClass",
  UNKNOWN: "tier.unknown",
};

/**
 * Localized, tier-colored badge (atomic-design molecule composed from the
 * `Badge` atom). `UNKNOWN` renders the neutral tone and label — the same
 * neutral fallback `resolveThemeTokens` applies for theme colors.
 */
export function TierBadge({ tier }: { tier: ServiceTier }) {
  const { t } = useTranslation();
  return <Badge tone={tier === "UNKNOWN" ? "neutral" : "accent"}>{t(TIER_LABEL_KEYS[tier])}</Badge>;
}
