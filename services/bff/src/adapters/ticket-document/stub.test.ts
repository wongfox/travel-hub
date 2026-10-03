import { describe, expect, it } from "vitest";
import { createTicketDocumentStub } from "./stub.js";
import { DocumentNotFoundError } from "../../modules/trip/ports.js";

async function readAll(body: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe("createTicketDocumentStub", () => {
  it("returns a readable body and contentType for a known seeded document id", async () => {
    const stub = createTicketDocumentStub();

    const result = await stub.fetch("DOC-1001-CONSETTUR");

    expect(result.contentType.length).toBeGreaterThan(0);
    const bytes = await readAll(result.body);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("returns different, deterministic content for a second known document id, proving it is not a fixed single fake", async () => {
    const stub = createTicketDocumentStub();

    const first = await stub.fetch("DOC-1001-CONSETTUR");
    const second = await stub.fetch("DOC-2002-MEAL");

    expect(await readAll(first.body)).not.toEqual(await readAll(second.body));
  });

  it("throws DocumentNotFoundError for an unknown document id", async () => {
    const stub = createTicketDocumentStub();

    await expect(stub.fetch("DOC-DOES-NOT-EXIST")).rejects.toBeInstanceOf(DocumentNotFoundError);
  });

  it("supports failure injection per design Decision 6's stub requirements", async () => {
    const stub = createTicketDocumentStub();
    stub.simulateFailureOnce();

    await expect(stub.fetch("DOC-1001-CONSETTUR")).rejects.toThrow(/simulated/i);

    // One-shot: the next call succeeds normally.
    const result = await stub.fetch("DOC-1001-CONSETTUR");
    expect(result.contentType.length).toBeGreaterThan(0);
  });
});
