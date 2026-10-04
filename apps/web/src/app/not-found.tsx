import { useTranslation } from "react-i18next";
import { ButtonLink } from "../shared/ui/atoms/button.js";
import { Icon } from "../shared/ui/atoms/icon.js";

/**
 * Rendered by the router when no route matches the current URL (task 4.2's
 * acceptance criterion: an undefined route renders this boundary, not a
 * crash). Copy is localized via the `common` namespace (task 4.3).
 */
export function NotFoundBoundary() {
  const { t } = useTranslation();

  return (
    <div className="page not-found">
      <span className="not-found__icon">
        <Icon name="train" size={40} />
      </span>
      <div role="alert" className="not-found__message">
        <h1 className="not-found__title">{t("notFound.title")}</h1>
        <p>{t("notFound.body")}</p>
      </div>
      <ButtonLink href="/trip" variant="secondary">
        {t("nav.home")}
      </ButtonLink>
    </div>
  );
}
