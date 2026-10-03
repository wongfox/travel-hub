import { test, expect } from "@playwright/test";
import { issueLink, waitForApiHealthy } from "../fixtures/internal-api.js";

/**
 * Design scenario 5/7: "pre check-in with fake media stream and
 * file-fallback".
 *
 * Exercises task 8.1-8.3: consent gate, `getUserMedia` capture via a fake
 * video stream (Chromium's `--use-fake-device-for-media-stream` +
 * `--use-fake-ui-for-media-stream` flags, configured below), and the
 * file-upload fallback path for a blocked-camera environment.
 *
 * BLOCKED today by THREE independent gaps (`e2e/KNOWN-GAPS.md`):
 * - Gap A: no way to obtain the link token.
 * - Gap B: `precheckin.capture_ui` defaults `false` with no override.
 * - Gap D: there is no `PrecheckinPage`/route registered in
 *   `apps/web/src/app/route-tree.tsx` at all — `PrecheckinCaptureFlow`
 *   exists and is unit-tested, but nothing composes it onto a navigable
 *   URL with passenger-ordinal selection and the task 8.3 submission call.
 *   This is independent of gaps A/B: even with a session and the flag on,
 *   there is still no page to navigate to.
 */
// Top-level (not inside the describe): Playwright forbids `use({ launchOptions })`
// in a describe group because it forces a new worker.
test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

test.describe("pre check-in capture", () => {

  test("camera capture flow completes with a fake media stream", async ({ page, context, request }) => {
    test.fixme(
      true,
      "Gaps A+B+D (e2e/KNOWN-GAPS.md): no token retrieval, precheckin.capture_ui flag off with no override, " +
        "and no PrecheckinPage/route exists in apps/web at all",
    );

    await context.grantPermissions(["camera"]);
    await waitForApiHealthy(request);

    const { token } = await issueLink(request, {
      reservationRef: "RES-1001",
      contact: { kind: "email", address: "passenger@example.com" },
      locale: "es",
    });

    await page.goto(`/t#${token}`);
    await expect(page).toHaveURL(/\/trip$/);

    // The actual destination path is TBD until Gap D's PrecheckinPage lands;
    // `/trip/precheckin` follows this codebase's `/trip/<feature>` sibling-route
    // convention (wifi, push, pulse, help, menu, destination all follow it).
    await page.goto("/trip/precheckin");

    await page.getByRole("button", { name: /acepto|i agree|aceito/i }).click();
    await page.getByRole("button", { name: /captur|capture/i }).click();
    await expect(page.getByText(/listo|ready|pronto/i)).toBeVisible();
  });

  test("file-upload fallback works when camera access is blocked", async ({ page, context, request }) => {
    test.fixme(
      true,
      "Gaps A+B+D (e2e/KNOWN-GAPS.md): no token retrieval, precheckin.capture_ui flag off with no override, " +
        "and no PrecheckinPage/route exists in apps/web at all",
    );

    // Deny camera access entirely to force the file-upload fallback
    // (`is-camera-available.ts`/`file-upload-fallback.tsx`, task 8.2).
    await context.clearPermissions();
    await waitForApiHealthy(request);

    const { token } = await issueLink(request, {
      reservationRef: "RES-1001",
      contact: { kind: "email", address: "passenger@example.com" },
      locale: "es",
    });

    await page.goto(`/t#${token}`);
    await page.goto("/trip/precheckin");
    await page.getByRole("button", { name: /acepto|i agree|aceito/i }).click();

    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeVisible();
    await fileInput.setInputFiles({
      name: "id-front.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
    });
    await expect(page.getByText(/listo|ready|pronto/i)).toBeVisible();
  });
});
