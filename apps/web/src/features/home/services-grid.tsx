import { useTranslation } from "react-i18next";
import type { TripDTO } from "contracts";
import { Icon } from "../../shared/ui/atoms/icon.js";
import { resolveServices } from "./resolve-services.js";

/**
 * Home "services" grid: one card per secondary screen the passenger may use
 * (gated by `resolveServices`). Plain anchors, like the tab bar, so the page
 * stays router-free. Titles are plain text, not headings, so the page's
 * heading outline stays unchanged.
 */
export function ServicesGrid({ trip }: { trip: Pick<TripDTO, "features" | "consentTextVersions"> }) {
  const { t } = useTranslation();
  const services = resolveServices(trip);

  return (
    <section className="stack" aria-labelledby="trip-services-heading">
      <h3 id="trip-services-heading" className="section-title">
        {t("services.heading")}
      </h3>
      <ul className="service-grid">
        {services.map((service) => (
          <li key={service.id}>
            <a href={service.href} className="service-card">
              <span className="service-card__icon">
                <Icon name={service.icon} size={24} />
              </span>
              <span className="service-card__text">
                <span className="service-card__title">{t(service.labelKey)}</span>
                <span className="service-card__desc">{t(service.descriptionKey)}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
