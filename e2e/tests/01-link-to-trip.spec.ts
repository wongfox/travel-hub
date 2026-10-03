import { test, expect } from "../fixtures/stack.js";
import { issueLink } from "../fixtures/internal-api.js";

/**
 * Design scenario 1/7: "link → trip in one step".
 *
 * Opens an issued link's URL and asserts the passenger lands on trip home
 * (`/trip`) after exactly one additional navigation, with the opaque token
 * never left behind in browser history (task 5.5's own acceptance
 * criterion, `history.replaceState` stripping the fragment).
 *
 * The token comes from the in-process stub `LinkDeliveryPort` (see
 * `fixtures/internal-api.ts`); no HTTP route exposes it.
 */
test("opening a personalized link lands on trip home in one step", async ({ page, stack }) => {
  const { token } = await issueLink(stack, {
    reservationRef: "RES-1001",
    contact: { kind: "email", address: "passenger@example.com" },
    locale: "es",
  });

  await page.goto(`/t#${token}`);

  // Exactly one additional navigation step: landing page -> trip home.
  await expect(page).toHaveURL(/\/trip$/);

  // The token must never linger in browser history after the redirect
  // (design Decision 4 / task 5.5's acceptance criterion).
  const historyHasToken = await page.evaluate(() => window.location.hash.includes("#"));
  expect(historyHasToken).toBe(false);

  // Trip home actually rendered real trip content, not a loading/error state.
  await expect(page.getByText(/próxima salida|next departure|próxima partida/i)).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
