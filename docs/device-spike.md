# Device capture spike (task 14.2)

Status: PROTOCOL WRITTEN. RESULTS PENDING HUMAN EXECUTION.
Acceptance for 14.2 ("the document records pass/fail per platform/browser
combination") is NOT met until a person runs this protocol on real devices
and fills the results table. Every result cell below is `NOT YET RUN`; no
result in this file has been observed by anyone. Do not treat any row as
passing.

## Purpose

Camera capture, file-input fallback, standalone push, and storage persistence
behave differently across mobile browsers and in-app webviews, and cannot be
verified by Vitest/jsdom or by the Playwright suite in `e2e/`. This spike
records real behavior so the fallbacks can be confirmed or adjusted.

## Fallbacks under test

- Task 8.2 file-input fallback: `apps/web/src/features/precheckin/capture/file-upload-fallback.tsx`
  (used when `is-camera-available.ts` reports no camera or `getUserMedia` is blocked).
  Camera path: `camera-capture.tsx`; quality checks: `compute-image-quality.ts`.
- Task 11.3 add-to-home-screen (a2hs) explainer: `apps/web/src/features/push/push-opt-in.tsx`
  and `push-page.tsx`, gated by flag `push.a2hs_prompt`; eligibility logic in
  `apps/web/src/shared/push/push-eligibility.ts`.

## Prerequisites

1. A deployed or tunneled build of `apps/web` + `services/bff` reachable over HTTPS
   (camera, service worker, and push require a secure context). The local stack is
   `docker-compose.yml` on port 8080; expose it with an HTTPS tunnel.
2. Flags enabled for the test build: `precheckin.capture_ui`, `push.enabled`,
   `push.a2hs_prompt`. NOTE: `e2e/KNOWN-GAPS.md` Gaps A, B, and D mean there is
   currently no way to obtain a link token black-box, no runtime flag override, and no
   web route composing the pre check-in capture flow. These must be resolved (or a
   dev build with hard-coded flags and a test harness page used) before steps
   S1 to S3 can be executed. Record any workaround used in the Notes column.
3. A valid issued link URL for a test reservation, sent to each test device.
4. Record device model, OS version, and browser version for every run.

## Device matrix

| ID | Environment | Steps |
|----|-------------|-------|
| M1 | iOS Safari (browser tab) | S1, S2, S4 |
| M2 | iOS Safari (installed standalone / home-screen) | S1, S2, S3, S4, S5 |
| M3 | Android Chrome (browser tab) | S1, S2, S3, S4 |
| M4 | Android Chrome (installed PWA) | S1, S3, S4 |
| M5 | WhatsApp in-app webview (iOS) | S1, S2, S4 |
| M6 | WhatsApp in-app webview (Android) | S1, S2, S4 |
| M7 | Gmail in-app webview (iOS) | S1, S2, S4 |
| M8 | Gmail in-app webview (Android) | S1, S2, S4 |
| M9 | Instagram in-app webview (iOS) | S1, S2, S4 |
| M10 | Instagram in-app webview (Android) | S1, S2, S4 |

## Steps and expected behavior

### S1. Link open

Steps: tap the issued link in the environment (for in-app webviews, open it from a
message/email/DM so the webview is the real entry point).
Expected: the app lands on trip home in one step with the token fragment stripped from
the URL; no re-prompt for credentials.

### S2. Camera capture and file-input fallback (task 8.2)

Steps:
1. Open the pre check-in flow and grant consent.
2. Tap the camera capture action. Accept the camera permission prompt. Capture a photo
   (front camera) and an ID (rear camera). Note whether the guided overlay renders.
3. Repeat after denying the camera permission (or in a webview that blocks it).
4. In the blocked case, use the file-upload fallback to pick a photo from the library
   and to take a photo via the OS file picker.
Expected:
- Camera granted: live preview shows, front camera for photo, rear for ID, capture
  yields a re-encoded JPEG with EXIF/GPS stripped, quality checks (resolution, blur,
  exposure) run.
- Camera denied/unavailable: the file-upload fallback appears automatically, accepts an
  image, and passes through the same re-encode and quality checks.
- No dead end: in every environment the user can submit an image by one of the two paths.
Record: which path worked, permission prompt behavior, orientation/mirroring
problems, and any error text.

### S3. Standalone push and a2hs explainer (task 11.3)

Steps:
1. In the browser tab (not installed), open the push opt-in screen.
2. Observe whether the a2hs explainer is shown where the platform requires standalone
   mode for push (iOS), and whether an ineligible platform is skipped gracefully.
3. Install to the home screen, reopen from the icon, and opt in to push.
4. Trigger a test notification (journey event or pulse prompt) and confirm delivery.
5. Revoke consent in-app and confirm the subscription is removed and no further
   notifications arrive.
Expected: iOS browser tab shows the a2hs explainer instead of a dead permission prompt;
iOS standalone and Android Chrome can subscribe and receive a notification; ineligible
environments (in-app webviews) skip the opt-in without error.

### S4. Storage persistence

Steps: in the environment, evaluate `await navigator.storage.persist()` and
`await navigator.storage.persisted()` (remote debugging, or a temporary debug page),
then use the app offline (airplane mode) after loading the boarding pass/tickets and
force-close and reopen the app.
Expected: record whether `persist()` resolves true or false. Boarding pass/tickets stay
visible offline after reopen if persistence is granted; document eviction behavior if not.
NOTE: no application code currently calls `navigator.storage.persist()` (verified by
search of `apps/web/src`), so a result of `false` or "unsupported" may only mean the
call was never made by the app. Calling it from a debug console is the measurement
for this spike; whether the app should request it is a follow-up decision.

### S5. iOS standalone push specifics

Steps: on iOS 16.4 or later in standalone mode, confirm the permission prompt appears
only after a user gesture, that notification tap opens the app to the expected screen,
and that a force-closed app still receives the notification.
Expected: same as S3 plus background delivery. Record iOS version.

## Results table

Result values allowed: PASS, FAIL, PARTIAL, N/A, NOT YET RUN. All cells start as
`NOT YET RUN`. Replace a cell only with an observed outcome and add the device,
OS, and browser version plus date in the Notes column.

| ID | Environment | S1 Link open | S2 Capture/fallback | S3 Push/a2hs | S4 Storage persist | S5 iOS standalone push | Device / OS / browser | Date | Notes |
|----|-------------|--------------|---------------------|--------------|--------------------|------------------------|-----------------------|------|-------|
| M1 | iOS Safari (tab) | NOT YET RUN | NOT YET RUN | N/A | NOT YET RUN | N/A | | | |
| M2 | iOS Safari (standalone) | NOT YET RUN | NOT YET RUN | NOT YET RUN | NOT YET RUN | NOT YET RUN | | | |
| M3 | Android Chrome (tab) | NOT YET RUN | NOT YET RUN | NOT YET RUN | NOT YET RUN | N/A | | | |
| M4 | Android Chrome (PWA) | NOT YET RUN | N/A | NOT YET RUN | NOT YET RUN | N/A | | | |
| M5 | WhatsApp webview (iOS) | NOT YET RUN | NOT YET RUN | N/A | NOT YET RUN | N/A | | | |
| M6 | WhatsApp webview (Android) | NOT YET RUN | NOT YET RUN | N/A | NOT YET RUN | N/A | | | |
| M7 | Gmail webview (iOS) | NOT YET RUN | NOT YET RUN | N/A | NOT YET RUN | N/A | | | |
| M8 | Gmail webview (Android) | NOT YET RUN | NOT YET RUN | N/A | NOT YET RUN | N/A | | | |
| M9 | Instagram webview (iOS) | NOT YET RUN | NOT YET RUN | N/A | NOT YET RUN | N/A | | | |
| M10 | Instagram webview (Android) | NOT YET RUN | NOT YET RUN | N/A | NOT YET RUN | N/A | | | |

Note: `N/A` cells are protocol decisions (the step is not expected to apply to that
environment per the matrix above), not results. If a tester finds an `N/A` step does
apply, run it and record the outcome.

## Findings and follow-ups

None recorded. This section is to be filled after the protocol is executed. For every
FAIL or PARTIAL, link the fallback it exercised (8.2 file-input fallback, 11.3 a2hs
explainer) and open a follow-up task.

## Sign-off

- Executed by: (pending)
- Date: (pending)
- 14.2 acceptance: PENDING HUMAN EXECUTION
