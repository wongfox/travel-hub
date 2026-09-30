import { useTranslation } from "react-i18next";

/**
 * Rendered by the router when no route matches the current URL (task 4.2's
 * acceptance criterion: an undefined route renders this boundary, not a
 * crash). Copy is localized via the `common` namespace (task 4.3).
 */
export function NotFoundBoundary() {
  const { t } = useTranslation();

  return (
    <div role="alert">
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.body")}</p>
    </div>
  );
}
