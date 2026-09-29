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

describe("reading the step's config", () => {
  const ID = "01234567-89ab-cdef-0123-456789abcdef";
  const service = () => ({
    ...reactor(() => Promise.resolve(summary)),
    get: vi.fn(() => Promise.resolve(summary)),
    model: vi.fn(() =>
      Promise.resolve({
        documentType: TYPE,
        name: "Commitment",
        stateSchema: null,
        actions: [
          {
            type: "SET_URL",
            module: "base",
            inputSchema: "input SetURLInput { url: URL!, weight: Float }",
          },
        ],
      }),
    ),
  });

  it("refuses an id in prose by default", async () => {
    const target = service();
    await expect(
      documentDispatchAction.run(
        context({ documentId: `Merge ${ID} into x`, actions: ACTIONS }, target),
      ),
    ).rejects.toThrow(/not a document id/);
    expect(target.execute).not.toHaveBeenCalled();
  });

  it("extracts on request and reports what it read from", async () => {
    const target = service();
    const documentId = `The document is ${ID}.`;
    const actions = `Thinking.assistantfinal${JSON.stringify(ACTIONS)}`;
    const output = await documentDispatchAction.run(
      context({ documentId, actions, parse: "extract" }, target),
    );

    expect(target.execute).toHaveBeenCalledExactlyOnceWith({
      documentId: ID,
      actions: ACTIONS,
    });
    expect(output).toMatchObject({ extractedFrom: { documentId, actions } });
  });

  it("types the input by the operation's own input name", async () => {
    const target = service();
    await documentDispatchAction.run(
      context(
        {
          documentId: ID,
          documentType: TYPE,
          actionType: "SET_URL",
          input: { url: "https://x.test", weight: "2" },
        },
        target,
      ),
    );

    expect(target.execute).toHaveBeenCalledExactlyOnceWith({
      documentId: ID,
      actions: [
        {
          type: "SET_URL",
          input: { url: "https://x.test", weight: 2 },
          scope: undefined,
        },
      ],
    });
  });

  it("fails on an input that is not an object instead of sending {}", async () => {
    const target = service();
    await expect(
      documentDispatchAction.run(
        context(
          {
            documentId: ID,
            documentType: TYPE,
            actionType: "SET_URL",
            input: '"https://x.test"',
          },
          target,
        ),
      ),
    ).rejects.toThrow(/"input" must be an object/);
    expect(target.execute).not.toHaveBeenCalled();
  });

  it("fails on a scalar action list instead of dispatching nothing", async () => {
    await expect(
      documentDispatchAction.run(
        context({ documentId: ID, actions: "42" }, service()),
      ),
    ).rejects.toThrow(/must be a list of actions/);
  });
});
