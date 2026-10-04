import { useTranslation } from "react-i18next";
import type { WifiPackageDTO } from "contracts";
import { Button } from "../../shared/ui/atoms/button.js";
import { EmptyState } from "../../shared/ui/atoms/empty-state.js";
import { Icon } from "../../shared/ui/atoms/icon.js";

export interface WifiCatalogProps {
  packages: WifiPackageDTO[];
  onBuy: (packageId: string) => void;
  /** Disables every buy action while a purchase is already in flight (task 10.4: never double-submit). */
  isBuying: boolean;
}

/** `es` keeps the Peruvian regional format (soles as `S/`); the other UI locales use their own language's currency format. */
const INTL_LOCALE_BY_UI_LOCALE: Record<string, string> = { es: "es-PE" };

function formatPrice(amountMinor: number, currency: string, uiLocale: string): string {
  const intlLocale = INTL_LOCALE_BY_UI_LOCALE[uiLocale] ?? uiLocale;
  return new Intl.NumberFormat(intlLocale, { style: "currency", currency }).format(amountMinor / 100);
}

/**
 * `wifi-package-checkout`'s display-only package catalog (task 10.4). The
 * purchase action itself (`onBuy`) is the only thing an independent
 * `wifi.checkout` kill switch needs to remove — see `WifiPage`, which never
 * renders this component at all once the catalog fetch 403s
 * `feature_disabled`.
 */
export function WifiCatalog({ packages, onBuy, isBuying }: WifiCatalogProps) {
  const { t, i18n } = useTranslation();

  if (packages.length === 0) {
    return <EmptyState icon="wifi">{t("wifi.noPackages")}</EmptyState>;
  }

  return (
    <ul className="wifi-list">
      {packages.map((pkg) => (
        <li key={pkg.id} data-testid="wifi-package" className="wifi-package">
          <div className="wifi-package__top">
            <p className="wifi-package__name">{pkg.name}</p>
            <p className="wifi-package__price">{formatPrice(pkg.priceMinor, pkg.currency, i18n.language)}</p>
          </div>
          <p className="wifi-package__duration">
            <Icon name="clock" size={16} />
            {t("wifi.duration", { minutes: pkg.durationMinutes })}
          </p>
          <Button block onClick={() => onBuy(pkg.id)} disabled={isBuying}>
            {t("wifi.buy")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
