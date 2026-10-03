import { test, expect } from "../fixtures/stack.js";
import type { InProcessStack } from "../harness/in-process-stack.js";
import { issueLink } from "../fixtures/internal-api.js";

/**
 * Design scenario 5/7: "pre check-in with fake media stream and
 * file-fallback".
 *
 * Exercises tasks 8.1-8.3 through the real `/trip/precheckin` page (gap D,
 * closed): passenger selection, the never-cached biometric consent gate,
 * `getUserMedia` capture via a fake video stream (Chromium's
 * `--use-fake-device-for-media-stream` + `--use-fake-ui-for-media-stream`
 * flags, configured below), the file-upload fallback for a blocked-camera
 * environment, and the multipart submission against the in-process BFF.
 *
 * Chromium-only (the fake-media launch flags); enforced for Firefox through
 * `playwright.config.ts`'s `testIgnore`. RES-1001 has two passengers, so the
 * page lists them; the stack (and its submission store) is shared by every
 * spec in the worker and a passenger can only submit once, so the camera test
 * completes Ana Torres (ordinal 1, passengerRef P1) and the fallback test
 * completes Luis Torres (ordinal 2, P2), each asserting only its own passenger.
 */
// Top-level (not inside the describe): Playwright forbids `use({ launchOptions })`
// in a describe group because it forces a new worker.
test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

type Passenger = { name: string; ordinal: number; passengerRef: string };
const ANA: Passenger = { name: "Ana Torres", ordinal: 1, passengerRef: "P1" };
const LUIS: Passenger = { name: "Luis Torres", ordinal: 2, passengerRef: "P2" };

async function openPrecheckinFor(page: import("@playwright/test").Page, stack: InProcessStack, passenger: Passenger) {
  const { token } = await issueLink(stack, {
    reservationRef: "RES-1001",
    contact: { kind: "email", address: "passenger@example.com" },
    locale: "en",
  });

  await page.goto(`/t#${token}`);
  await expect(page).toHaveURL(/\/trip$/);
  // The CTA on trip home is only rendered when the flag is on and a consent version is published.
  await page.getByRole("link", { name: "Pre check-in" }).click();
  await expect(page).toHaveURL(/\/trip\/precheckin$/);

  // Two passengers on the reservation: choose one, nothing is captured or asked yet.
  await expect(page.getByText(passenger.name, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "I agree" })).toHaveCount(0);
  await page.getByRole("button", { name: `Start pre check-in for ${passenger.name}` }).click();
}

async function expectSubmissionRecorded(
  stack: InProcessStack,
  page: import("@playwright/test").Page,
  passenger: Passenger,
) {
  await expect(page.getByText("Pre check-in received. Thank you.")).toBeVisible();

  // Only the status is ever exposed back, never any image content.
  const trip = await page.evaluate(async () => (await fetch("/api/trip")).json());
  expect(trip.passengers).toContainEqual(
    expect.objectContaining({ ordinal: passenger.ordinal, precheckinStatus: "received" }),
  );
  expect(JSON.stringify(trip)).not.toMatch(/image|jpeg|base64/i);
  expect(await stack.precheckinSubmissionStore.findByPassenger("RES-1001", passenger.passengerRef)).not.toBeNull();
}

test.describe("pre check-in capture", () => {
  test("camera capture flow completes with a fake media stream", async ({ page, context, stack }) => {
    await context.grantPermissions(["camera"]);
    await openPrecheckinFor(page, stack, ANA);

    // Consent first: no camera request and no capture UI until it is recorded.
    await expect(page.getByRole("button", { name: "Capture" })).toHaveCount(0);
    await page.getByRole("button", { name: "I agree" }).click();

    await expect(page.getByRole("heading", { name: "Your photo" })).toBeVisible();
    await page.getByRole("button", { name: "Capture" }).click();
    await expect(page.getByRole("heading", { name: "ID document (front)" })).toBeVisible();
    await page.getByRole("button", { name: "Capture" }).click();

    await page.getByLabel("Document type").selectOption("DNI");
    await page.getByRole("button", { name: "Send pre check-in" }).click();

    await expectSubmissionRecorded(stack, page, ANA);
  });

  test("file-upload fallback works when camera access is blocked", async ({ page, stack }) => {
    // A blocked camera: the page's own `getUserMedia` request is denied, which
    // must route the passenger to the file inputs instead of a dead end.
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
    });
    await openPrecheckinFor(page, stack, LUIS);
    await page.getByRole("button", { name: "I agree" }).click();

    const jpeg = { mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]) };
    await page.locator('input[type="file"]').setInputFiles({ name: "photo.jpg", ...jpeg });
    await page.locator('input[type="file"]').setInputFiles({ name: "id-front.jpg", ...jpeg });

    await page.getByLabel("Document type").selectOption("PASSPORT");
    await page.getByRole("button", { name: "Send pre check-in" }).click();

    await expectSubmissionRecorded(stack, page, LUIS);
  });
});
