export type IconName =
  | "trip"
  | "itinerary"
  | "documents"
  | "precheckin"
  | "clock"
  | "alert"
  | "info"
  | "check"
  | "offline"
  | "external"
  | "train";

/** 24px outline paths (stroke = currentColor); purely decorative, so always `aria-hidden`. */
const PATHS: Record<IconName, string> = {
  trip: "M4 11.5 12 4l8 7.5M6 10v9h12v-9M10 19v-5h4v5",
  itinerary: "M6 4v4m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 4v4m12-8v8m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM6 12c0 4 12 0 12 4",
  documents: "M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8ZM14 6v12",
  precheckin: "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1ZM7 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1M9 14l2 2 4-4",
  clock: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  alert: "M12 8v5m0 3.5v.01M10.3 4.2 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z",
  info: "M12 11v5m0-8.5v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  check: "m5 12.5 4.5 4.5L19 7.5",
  offline: "M3 3l18 18M8.5 8.6A5 5 0 0 0 7 12a4 4 0 0 0 .5 8H17M17.5 14.5A3.5 3.5 0 0 0 16 8a5 5 0 0 0-5.2-3",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  train: "M7 4h10a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2Zm-2 9h14M8 18l-2 3m12-3 2 3M9 8h6",
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
