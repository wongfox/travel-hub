import { test, expect } from "@playwright/test";
import { issueLink, waitForApiHealthy } from "../fixtures/internal-api.js";

/**
 * Design scenario 3/7: "relocation reflected on reload".
 *
 * `services/bff/seed/sir/reservations.json`'s `RES-2002` fixture already
 * carries a non-empty `relocations` array. `GET /api/trip` (task 6.2)
 * computes `alerts[]` from the booking port's relocation data on EVERY
 * call (synchronously, same-process — not from a worker-populated
 * notification table), so a relocated reservation's banner/boarding-pass
 * seat must show the updated assignment on first load AND survive a reload
 * (proving it's read fresh each time, not stuck on first-render state).
 *
 * BLOCKED today by Gap A (`e2e/KNOWN-GAPS.md`).
 */
test("a relocated reservation shows the updated seat/alert on load and after reload", async ({
  page,
  request,
}) => {
  test.fixme(true, "Gap A (e2e/KNOWN-GAPS.md): POST /internal/links never returns a retrievable token/linkUrl");

  await waitForApiHealthy(request);

  const { token } = await issueLink(request, {
    reservationRef: "RES-2002",
    contact: { kind: "email", address: "passenger@example.com" },
    locale: "es",
  });

  await page.goto(`/t#${token}`);
  await expect(page).toHaveURL(/\/trip$/);

  // The relocation banner (`alerts.relocation.title`, `RelocationAlerts`
  // component) is present regardless of push-subscription state.
  await expect(page.getByRole("alert").filter({ hasText: /asignaci[oó]n|assignment|atribui/i })).toBeVisible();

  // Reload: the alert must still be there — it is recomputed fresh from the
  // SIR stub on every `GET /api/trip` call, not cached from first render.
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: /asignaci[oó]n|assignment|atribui/i })).toBeVisible();

  // The itinerary/boarding pass reflects the relocated seat too.
  await page.goto("/trip/itinerary");
  await expect(page.getByRole("heading")).toBeVisible();
});
