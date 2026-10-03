import type { Page } from "@playwright/test";

/**
 * Calls a same-origin BFF route FROM INSIDE the page, so the browser itself
 * attaches the passenger's session cookie exactly as the web app's own
 * requests do (the cookie is `Secure` + `__Host-` prefixed, which Playwright's
 * out-of-page request jar does not replay over plain http).
 */
export async function pageFetchJson(
  page: Page,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ({ path: p, body: b }) => {
      const response = await fetch(p, {
        method: b === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        ...(b === undefined ? {} : { body: JSON.stringify(b) }),
      });
      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // non-JSON body: keep the raw text
      }
      return { status: response.status, body: parsed };
    },
    { path, body },
  );
}

/**
 * Records a consent for the current passenger session via `POST /api/consents`.
 *
 * Only for flows that bypass the UI (scenario 6 drives `POST /api/pulse` from
 * the page because no seeded reservation has a COMPLETED leg). UI-driven
 * flows must accept the real consent gate instead (scenario 7).
 */
export async function grantConsent(page: Page, purpose: "push" | "pulse" | "analytics"): Promise<void> {
  const result = await pageFetchJson(page, "/api/consents", { purpose, textVersion: "e2e-1", granted: true });
  if (result.status !== 201) {
    throw new Error(`POST /api/consents (${purpose}) failed: ${result.status} ${JSON.stringify(result.body)}`);
  }
}
