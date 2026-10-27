import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { describe, expect, it, vi } from "vitest";
import {
  createNeedsModel,
  createProtocolGate,
  modelUnavailableRefusal,
  stateReducerOrRefusal,
} from "../../src/protocol/gate.js";
import { firstUnsupportedProtocol } from "../../src/protocol/support.js";
import { createMockLogger, createTestRegistry } from "../factories.js";

const MODEL = "powerhouse/document-model";
const SUPPORT = { "base-reducer": [1, 2, 3], signature: [1] };

function untagged<T extends DocumentModelModule<any>>(module: T): T {
  const reducer = module.reducer as (...args: unknown[]) => unknown;
  return { ...module, reducer: (...args: unknown[]) => reducer(...args) };
}

describe("the protocol gate", () => {
  it("refuses an unsupported version, typed", () => {
    const gate = createProtocolGate(
      { "base-reducer": [1, 2] },
      createTestRegistry(),
      createMockLogger(),
    );
    const refusal = gate.refusal("doc", { "base-reducer": 3 }, MODEL);
    expect(refusal?.name).toBe("UnsupportedProtocolVersionError");
    expect(refusal?.documentType).toBeUndefined();
    expect(() => gate.assertRunnable("doc", { "base-reducer": 3 })).toThrow(
      "which this reactor does not support",
    );
  });

  it("refuses 3 for an untagged model and admits it for a tagged one", () => {
    const tagged = createProtocolGate(
      SUPPORT,
      createTestRegistry(),
      createMockLogger(),
    );
    const plain = createProtocolGate(
      SUPPORT,
      createTestRegistry([untagged(documentModelDocumentModelModule)]),
      createMockLogger(),
    );
    expect(tagged.refusal("doc", { "base-reducer": 3 }, MODEL)).toBeUndefined();
    expect(
      plain.refusal("doc", { "base-reducer": 3 }, MODEL)?.documentType,
    ).toBe(MODEL);
    expect(plain.refusal("doc", { "base-reducer": 2 }, MODEL)).toBeUndefined();
    expect(plain.refusal("doc", { "base-reducer": 3 })).toBeUndefined();
  });

  it("admits an unregistered protocol and logs it once", () => {
    const logger = createMockLogger();
    const info = vi.spyOn(logger, "info");
    const gate = createProtocolGate(SUPPORT, createTestRegistry(), logger);
    expect(gate.refusal("a", { future: 9 })).toBeUndefined();
    expect(gate.refusal("b", { future: 9 })).toBeUndefined();
    expect(info).toHaveBeenCalledTimes(1);
  });

  it("agrees with the startup check on protocol-only refusals", () => {
    expect(firstUnsupportedProtocol({ "base-reducer": 4 }, SUPPORT)).toEqual({
      protocol: "base-reducer",
      version: 4,
    });
    expect(firstUnsupportedProtocol({ future: 1 }, SUPPORT)).toBeUndefined();
  });

  it("refuses a create whose versions need a model that cannot load", () => {
    expect(createNeedsModel({ "base-reducer": 3 })).toBe(true);
    expect(createNeedsModel({ "base-reducer": 2 })).toBe(false);
    expect(
      modelUnavailableRefusal({
        documentId: "doc",
        model: MODEL,
        protocolVersions: { "base-reducer": 3 },
      })?.documentType,
    ).toBe(MODEL);
    expect(
      modelUnavailableRefusal({
        documentId: "doc",
        model: MODEL,
        protocolVersions: { "base-reducer": 2 },
      }),
    ).toBeUndefined();
  });

  it("turns a missing state reducer into the typed refusal", () => {
    const reducer = untagged(documentModelDocumentModelModule).reducer;
    expect(() =>
      stateReducerOrRefusal(reducer, "doc", MODEL, 1, { "base-reducer": 3 }),
    ).toThrow(
      expect.objectContaining({
        name: "UnsupportedProtocolVersionError",
        documentType: MODEL,
        version: 3,
      }),
    );
    expect(
      stateReducerOrRefusal(
        documentModelDocumentModelModule.reducer,
        "doc",
        MODEL,
        1,
        { "base-reducer": 3 },
      ),
    ).toBeTypeOf("function");
  });
});
