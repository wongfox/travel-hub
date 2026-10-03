import { test, expect } from "../fixtures/stack.js";
import { issueLink } from "../fixtures/internal-api.js";
import { grantConsent, pageFetchJson } from "../fixtures/passenger-api.js";

/**
 * Design scenario 6/7: "negative pulse -> exactly one `staff_alert`".
 *
 * Submits a negative `POST /api/pulse` score and asserts exactly one
 * `staff_alert` is dispatched (task 11.4/11.5's D4a alerting), even under a
 * simulated concurrent retry of the same submission.
 *
 * Runs against the in-process BFF: `pulse.capture`/`pulse.staff_alerts` are
 * enabled via the composition root's `flags` option, api and worker share one
 * `StaffAlertStore`, and the dispatched alerts are read straight from the
 * injected `StaffAlertStub.deliveries[]` (no inspection route exists).
 */
test("a negative pulse response dispatches exactly one staff alert, even retried", async ({ page, stack }) => {
  const { token } = await issueLink(stack, {
    reservationRef: "RES-1001",
    contact: { kind: "email", address: "passenger@example.com" },
    locale: "es",
  });

  await page.goto(`/t#${token}`);
  await expect(page).toHaveURL(/\/trip$/);

  // Gap E (e2e/KNOWN-GAPS.md): the web has no pulse consent screen, so the
  // consent the BFF requires is recorded through the public consent route.
  await grantConsent(page, "pulse");

  // Two identical submissions in flight, simulating the concurrent-retry case
  // task 11.5's acceptance criterion names explicitly. Sent from the page so
  // the session cookie rides along.
  const payload = { legId: "L1", score: 1 };
  const [first, second] = await Promise.all([
    pageFetchJson(page, "/api/pulse", payload),
    pageFetchJson(page, "/api/pulse", payload),
  ]);
  expect([first.status, second.status]).toContain(201);

  await stack.runJobs();
  await stack.runJobs();
  expect(stack.staffAlert.deliveries).toHaveLength(1);
  expect(stack.staffAlert.deliveries[0]).toMatchObject({ score: 1 });
});
