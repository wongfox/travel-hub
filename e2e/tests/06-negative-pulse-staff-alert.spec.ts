import { test, expect } from "@playwright/test";
import { issueLink, waitForApiHealthy, API_BASE_URL } from "../fixtures/internal-api.js";

/**
 * Design scenario 6/7: "negative pulse → exactly one `staff_alert`".
 *
 * Submits a negative `POST /api/pulse` score and asserts exactly one
 * `staff_alert` is dispatched (task 11.4/11.5's D4a alerting), even under a
 * simulated concurrent retry of the same submission.
 *
 * BLOCKED today by THREE independent gaps (`e2e/KNOWN-GAPS.md`):
 * - Gap A: no way to obtain the link token.
 * - Gap B: `pulse.capture`/`pulse.staff_alerts` default `false` with no
 *   override.
 * - Gap C: `dispatch-staff-alerts-job.ts` runs in the separate `bff-worker`
 *   process against its OWN empty, in-memory `StaffAlertStore` — it will
 *   never see a row `bff-api`'s `POST /api/pulse` wrote.
 *
 * Additionally, even past all three gaps, there is no HTTP-observable way
 * to assert "exactly one `staff_alert` row" from outside the process — the
 * `ADAPTER_STAFF_ALERT=stub` adapter
 * (`services/bff/src/adapters/staff-alert/stub.ts`) only records sends in
 * an in-process array, with no inspection route, the same class of gap as
 * Gap A's `LinkDeliveryStub`. A real fix for Gap C (a Postgres-backed
 * `StaffAlertStore`) would make this independently inspectable via direct
 * DB query instead, which is the more realistic production-shaped
 * verification path anyway.
 */
test("a negative pulse response dispatches exactly one staff alert, even retried", async ({
  page,
  request,
}) => {
  test.fixme(
    true,
    "Gaps A+B+C (e2e/KNOWN-GAPS.md): no token retrieval, pulse flags off with no override, " +
      "and bff-api/bff-worker don't share the StaffAlertStore (and no DB/HTTP inspection path exists yet)",
  );

  await waitForApiHealthy(request);

  const { token } = await issueLink(request, {
    reservationRef: "RES-1001",
    contact: { kind: "email", address: "passenger@example.com" },
    locale: "es",
  });

  await page.goto(`/t#${token}`);
  await expect(page).toHaveURL(/\/trip$/);

  // Submit the SAME negative score twice in flight, simulating the
  // concurrent-retry case task 11.5's acceptance criterion names
  // explicitly ("exactly one staff_alert row even under a simulated
  // concurrent retry of the same submission").
  // `page.request` (not the top-level `request` fixture) shares the
  // browser context's cookie jar, so the `__Host-th_sess` cookie set by the
  // link-landing exchange above is sent along automatically.
  const payload = { legId: "L1", score: 1 };
  const [first, second] = await Promise.all([
    page.request.post(`${API_BASE_URL}/api/pulse`, { data: payload }),
    page.request.post(`${API_BASE_URL}/api/pulse`, { data: payload }),
  ]);
  expect([first.status(), second.status()]).toContain(201);

  // The passenger-visible UI shows the thank-you state regardless of the
  // alert dispatch outcome (11.5's "succeeds regardless of StaffAlertPort"
  // acceptance criterion).
  await page.goto("/trip/pulse");
  await expect(page.getByText(/gracias|thanks|obrigad/i)).toBeVisible();

  // Once Gap C has a real inspection path, assert exactly one staff_alert
  // row exists for this (passenger, leg) pair here.
});
