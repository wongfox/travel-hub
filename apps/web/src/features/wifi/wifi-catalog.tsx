import { useTranslation } from "react-i18next";
import type { WifiPackageDTO } from "contracts";

export interface WifiCatalogProps {
  packages: WifiPackageDTO[];
  onBuy: (packageId: string) => void;
  /** Disables every buy action while a purchase is already in flight (task 10.4: never double-submit). */
  isBuying: boolean;
}

function formatPrice(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(amountMinor / 100);
}

/**
 * `wifi-package-checkout`'s display-only package catalog (task 10.4). The
 * purchase action itself (`onBuy`) is the only thing an independent
 * `wifi.checkout` kill switch needs to remove — see `WifiPage`, which never
 * renders this component at all once the catalog fetch 403s
 * `feature_disabled`.
 */
export function WifiCatalog({ packages, onBuy, isBuying }: WifiCatalogProps) {
  const { t } = useTranslation();

  if (packages.length === 0) {
    return <p>{t("wifi.noPackages")}</p>;
  }

  return (
    <ul>
      {packages.map((pkg) => (
        <li key={pkg.id} data-testid="wifi-package">
          <p>{pkg.name}</p>
          <p>{formatPrice(pkg.priceMinor, pkg.currency)}</p>
          <p>{t("wifi.duration", { minutes: pkg.durationMinutes })}</p>
          <button type="button" onClick={() => onBuy(pkg.id)} disabled={isBuying}>
            {t("wifi.buy")}
          </button>
        </li>
      ))}
    </ul>
  );
}
