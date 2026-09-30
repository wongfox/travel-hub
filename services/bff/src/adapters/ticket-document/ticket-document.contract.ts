import type { ConformanceSpec } from "../_conformance-harness/conformance-harness.js";
import { DocumentNotFoundError } from "../../modules/trip/ports.js";
import type { TicketDocumentPort } from "../../modules/trip/ports.js";

async function drain(body: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

/**
 * Conformance suite for `TicketDocumentPort` (design Decision 6): runs
 * against the stub in CI, and against any real adapter once a third-party
 * ticket file source is documented (design's Open Questions). Every case
 * holds for the seeded fixture ids `DOC-1001-CONSETTUR`/`DOC-2002-MEAL`
 * (`services/bff/seed/sir/reservations.json`), which any conforming adapter
 * must also resolve.
 */
export const ticketDocumentContract: ConformanceSpec<TicketDocumentPort> = {
  cases: [
    {
      name: "fetch returns a non-empty contentType and a readable, non-empty body for a known document id",
      async run(port) {
        const result = await port.fetch("DOC-1001-CONSETTUR");
        if (typeof result.contentType !== "string" || result.contentType.length === 0) {
          throw new Error("fetch did not return a non-empty contentType");
        }
        const bytes = await drain(result.body);
        if (bytes.length === 0) {
          throw new Error("fetch returned an empty body for a known document id");
        }
      },
    },
    {
      name: "fetch throws DocumentNotFoundError for an unknown document id",
      async run(port) {
        let thrown: unknown;
        try {
          await port.fetch("DOC-DOES-NOT-EXIST");
        } catch (error) {
          thrown = error;
        }
        if (!(thrown instanceof DocumentNotFoundError)) {
          throw new Error("expected a DocumentNotFoundError to be thrown for an unknown document id");
        }
      },
    },
  ],
};
