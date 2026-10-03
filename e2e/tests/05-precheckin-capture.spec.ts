import { test, expect } from "../fixtures/stack.js";
import { issueLink } from "../fixtures/internal-api.js";

/**
 * Design scenario 5/7: "pre check-in with fake media stream and
 * file-fallback".
 *
 * Exercises task 8.1-8.3: consent gate, `getUserMedia` capture via a fake
 * video stream (Chromium's `--use-fake-device-for-media-stream` +
 * `--use-fake-ui-for-media-stream` flags, configured below), and the
 * file-upload fallback path for a blocked-camera environment.
 *
 * STILL BLOCKED by Gap D only (`e2e/KNOWN-GAPS.md`); gaps A (token retrieval)
 * and B (flags) are resolved by the in-process harness, but:
 * - Gap D: there is no `PrecheckinPage`/route registered in
 *   `apps/web/src/app/route-tree.tsx` at all — `PrecheckinCaptureFlow`
 *   exists and is unit-tested, but nothing composes it onto a navigable
 *   URL with passenger-ordinal selection and the task 8.3 submission call.
 *   Even with a session and the flag on, there is still no page to navigate to.
 */
// Top-level (not inside the describe): Playwright forbids `use({ launchOptions })`
// in a describe group because it forces a new worker.
test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

test.describe("pre check-in capture", () => {
  test("camera capture flow completes with a fake media stream", async ({ page, context, stack }) => {
    test.fixme(
      true,
      "Gap D (e2e/KNOWN-GAPS.md): no PrecheckinPage/route exists in apps/web at all",
    );

    await context.grantPermissions(["camera"]);

    const { token } = await issueLink(stack, {
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

  test("file-upload fallback works when camera access is blocked", async ({ page, context, stack }) => {
    test.fixme(
      true,
      "Gap D (e2e/KNOWN-GAPS.md): no PrecheckinPage/route exists in apps/web at all",
    );

    // Deny camera access entirely to force the file-upload fallback
    // (`is-camera-available.ts`/`file-upload-fallback.tsx`, task 8.2).
    await context.clearPermissions();

    const { token } = await issueLink(stack, {
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
