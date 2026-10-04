export interface PoiMapProps {
  /** The CMS media id returned as `RichContent.body` for the `poi_map` destination section. */
  mediaId: string;
  title: string;
}

/**
 * `destination-content`'s points-of-interest map (task 9.4, spec "Map is
 * static, not a live location feature"). A plain `<img>` proxied through
 * `GET /api/content/media/:id` — deliberately not a map library, iframe
 * embed, or canvas, so there is no live/real-time position or tracking data
 * anywhere in this component, distinct from the deferred on-train real-time
 * ETA map.
 */
export function PoiMap({ mediaId, title }: PoiMapProps) {
  return <img className="poi-map" src={`/api/content/media/${mediaId}`} alt={title} />;
}
