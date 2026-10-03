import { test, expect } from "../fixtures/stack.js";
import { issueLink } from "../fixtures/internal-api.js";
import { readLocaleCatalog, lookup, SUPPORTED_LOCALES, type SupportedLocale } from "../fixtures/locale-catalog.js";

/**
 * Design scenario 8/7 (the extra one): "ES/EN/PT smoke pass across the
 * shipped screens".
 *
 * Forces each locale via `localStorage["th-locale"]` (`apps/web/src/i18n/index.ts`'s
 * `LOCALE_STORAGE_KEY`/explicit-choice resolution — task 4.3 Decision 14)
 * BEFORE navigation, then asserts the REAL shipped catalog string
 * (`fixtures/locale-catalog.ts` reads the actual JSON files, not a
 * second hardcoded copy) renders on screen.
 *
 * Runs against the in-process BFF (`fixtures/stack.ts`): the not-found and
 * invalid-link states need no session; the authenticated screens use a link
 * token read from the stub delivery port. `menu.enabled`/`destination.enabled`
 * are on in the harness, but `/trip/menu` and `/trip/destination` are still
 * not part of this sweep (not yet covered by a scenario of their own).
 */
async function setLocale(page: import("@playwright/test").Page, locale: SupportedLocale): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("th-locale", value);
  }, locale);
}

for (const locale of SUPPORTED_LOCALES) {
  test.describe(`locale smoke — ${locale}`, () => {
    test(`not-found boundary renders fully in ${locale}`, async ({ page }) => {
      await setLocale(page, locale);
      const catalog = readLocaleCatalog(locale);

      await page.goto("/this-route-does-not-exist");

      await expect(page.getByRole("alert")).toContainText(lookup(catalog, "notFound.title"));
      await expect(page.getByRole("alert")).toContainText(lookup(catalog, "notFound.body"));
    });

    test(`invalid-link state renders fully in ${locale}`, async ({ page }) => {
      await setLocale(page, locale);
      const catalog = readLocaleCatalog(locale);

      // No fragment at all -> `readTokenFromHash` returns null -> the
      // landing page renders its error/re-request state immediately,
      // without ever calling the BFF.
      await page.goto("/t");

      await expect(page.getByRole("alert")).toContainText(lookup(catalog, "tripAccess.invalidLink"));
      await expect(page.getByRole("button", { name: lookup(catalog, "tripAccess.relinkForm.submit") })).toBeVisible();
    });

    test(`shipped trip screens render fully in ${locale}`, async ({ page, stack }) => {
      await setLocale(page, locale);
      const catalog = readLocaleCatalog(locale);

      const { token } = await issueLink(stack, {
        reservationRef: "RES-1001",
        contact: { kind: "email", address: "passenger@example.com" },
        locale,
      });

      await page.goto(`/t#${token}`);
      await expect(page).toHaveURL(/\/trip$/);
      await expect(page.getByText(lookup(catalog, "nav.itinerary"))).toBeVisible();
      await expect(page.getByText(lookup(catalog, "nav.documents"))).toBeVisible();

      await page.goto("/trip/itinerary");
      await expect(page.getByRole("heading", { level: 2 })).toContainText(lookup(catalog, "itinerary.heading"));

      await page.goto("/trip/documents");
      await expect(page.getByRole("heading", { level: 2 })).toContainText(lookup(catalog, "documents.heading"));

      await page.goto("/trip/help");
      await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
    });
  });
}
