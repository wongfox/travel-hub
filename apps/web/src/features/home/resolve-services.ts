import type { TripDTO } from "contracts";
import type { IconName } from "../../shared/ui/atoms/icon.js";

export type ServiceId = "help" | "menu" | "destination" | "wifi" | "push" | "pulse";

export interface ServiceEntry {
  id: ServiceId;
  href: string;
  /** Reuses the `nav.*` label of the destination screen. */
  labelKey: string;
  descriptionKey: string;
  icon: IconName;
}

type ServiceGateInput = Pick<TripDTO, "features" | "consentTextVersions">;

interface ServiceDefinition extends ServiceEntry {
  /** The same gate the destination page itself applies, so a card never leads to an "unavailable" screen. */
  isOffered: (trip: ServiceGateInput) => boolean;
}

const DEFINITIONS: ServiceDefinition[] = [
  {
    id: "help",
    href: "/trip/help",
    labelKey: "nav.help",
    descriptionKey: "services.description.help",
    icon: "help",
    isOffered: () => true,
  },
  {
    id: "menu",
    href: "/trip/menu",
    labelKey: "nav.menu",
    descriptionKey: "services.description.menu",
    icon: "menu",
    isOffered: (trip) => Boolean(trip.features.menuEnabled),
  },
  {
    id: "destination",
    href: "/trip/destination",
    labelKey: "nav.destination",
    descriptionKey: "services.description.destination",
    icon: "destination",
    isOffered: (trip) => Boolean(trip.features.destinationEnabled),
  },
  {
    id: "wifi",
    href: "/trip/wifi",
    labelKey: "nav.wifi",
    descriptionKey: "services.description.wifi",
    icon: "wifi",
    isOffered: (trip) => Boolean(trip.features.wifiCheckout),
  },
  {
    id: "push",
    href: "/trip/push",
    labelKey: "nav.push",
    descriptionKey: "services.description.push",
    icon: "bell",
    isOffered: (trip) => Boolean(trip.features.pushEnabled && trip.consentTextVersions?.push),
  },
  {
    id: "pulse",
    href: "/trip/pulse",
    labelKey: "nav.pulse",
    descriptionKey: "services.description.pulse",
    icon: "pulse",
    isOffered: (trip) => Boolean(trip.features.pulseCapture && trip.consentTextVersions?.pulse),
  },
];

/**
 * The secondary screens (help, menu, destination, WiFi, notifications, pulse)
 * that the trip home offers as service cards. Pre check-in is not here: it is
 * already a bottom-tab destination (`isPrecheckinOffered`). Each card is gated
 * by exactly the passenger flag (and consent version) its page checks.
 */
export function resolveServices(trip: ServiceGateInput): ServiceEntry[] {
  return DEFINITIONS.filter((definition) => definition.isOffered(trip)).map((definition) => ({
    id: definition.id,
    href: definition.href,
    labelKey: definition.labelKey,
    descriptionKey: definition.descriptionKey,
    icon: definition.icon,
  }));
}
