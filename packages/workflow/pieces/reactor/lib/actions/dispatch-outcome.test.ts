// A reducer that rejects its input still records the operation, with the
// reason on operation.error, and leaves the state untouched.

// The host's ctx.reactor turns that into a rejected call; what matters here is
// that these blocks let it through rather than answering with a document.
import { describe, expect, it, vi } from "vitest";
import { documentCreateAction } from "./document-create.js";
import { documentDispatchAction } from "./document-dispatch.js";

const DOCUMENT = "doc-1";
const TYPE = "acme/commitment";

const REJECTED =
  'Action SET_COMMITMENT failed: [{"expected":"number","code":"invalid_type",' +
  '"path":["latePenaltyPerHour"],"message":"Invalid input"}]';

const summary = {
  documentId: DOCUMENT,
  documentType: TYPE,
  name: "Commitment",
  state: { customer: "Brenner" },
};

function reactor(execute: () => Promise<unknown>) {
  return {
    create: vi.fn(() => Promise.resolve(summary)),
    execute: vi.fn(execute),
  };
}

const context = (propsValue: Record<string, unknown>, service: unknown) =>
  ({ propsValue, reactor: service }) as never;

const ACTIONS = [{ type: "SET_COMMITMENT", input: { customer: "Brenner" } }];

describe("document-dispatch", () => {
  it("fails the step when the dispatch was refused", async () => {
    const service = reactor(() => Promise.reject(new Error(REJECTED)));

    await expect(
      documentDispatchAction.run(
        context({ documentId: DOCUMENT, actions: ACTIONS }, service),
      ),
    ).rejects.toThrow(/latePenaltyPerHour/);
  });

  it("answers with the document when the dispatch took", async () => {
    const service = reactor(() => Promise.resolve(summary));

    const output = await documentDispatchAction.run(
      context({ documentId: DOCUMENT, actions: ACTIONS }, service),
    );

    expect(service.execute).toHaveBeenCalledExactlyOnceWith({
      documentId: DOCUMENT,
      actions: ACTIONS,
    });
    expect(output).toEqual(summary);
  });
});

describe("document-create", () => {
  it("fails the step when its follow-up actions were refused", async () => {
    const service = reactor(() => Promise.reject(new Error(REJECTED)));

    await expect(
      documentCreateAction.run(
        context({ documentType: TYPE, actions: ACTIONS }, service),
      ),
    ).rejects.toThrow(/latePenaltyPerHour/);
  });

  it("answers with the document when they took", async () => {
    const service = reactor(() => Promise.resolve(summary));

    const output = await documentCreateAction.run(
      context({ documentType: TYPE, actions: ACTIONS }, service),
    );

    expect(output).toEqual(summary);
  });
});
