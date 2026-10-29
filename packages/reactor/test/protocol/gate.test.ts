import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { describe, expect, it, vi } from "vitest";
import {
  baseReducerResolver,
  createNeedsModel,
  createProtocolGate,
  modelUnavailableRefusal,
  stateReducerOrRefusal,
  UNGATED,
} from "../../src/protocol/gate.js";
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
    expect(() => gate.assertReadable("doc", { "base-reducer": 3 })).toThrow(
      "which this reactor does not support",
    );
  });

  it("refuses reads on the base-reducer version alone", () => {
    const gate = createProtocolGate(
      { "base-reducer": [1, 2], signature: [2] },
      createTestRegistry(),
      createMockLogger(),
    );
    const versions = { "base-reducer": 2, signature: 9 };
    expect(gate.refusal("doc", versions)?.protocol).toBe("signature");
    expect(gate.readRefusal("doc", versions)).toBeUndefined();
    expect(gate.readRefusal("doc", { "base-reducer": 3 })?.version).toBe(3);
    // A number this build does not know reads as base-reducer 2 here.
    expect(gate.readRefusal("doc", { "base-reducer": 9 })).toBeUndefined();
    expect(gate.refusal("doc", { "base-reducer": 9 })?.version).toBe(9);
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

  it("refuses a create whose versions need a model that cannot load", () => {
    const gate = createProtocolGate(SUPPORT, createTestRegistry());
    expect(createNeedsModel(gate, { "base-reducer": 3 })).toBe(true);
    expect(createNeedsModel(gate, { "base-reducer": 2 })).toBe(false);
    expect(createNeedsModel(gate, { "base-reducer": 7 })).toBe(true);
    expect(createNeedsModel(UNGATED, { "base-reducer": 7 })).toBe(false);
    expect(
      modelUnavailableRefusal(gate, {
        documentId: "doc",
        model: MODEL,
        protocolVersions: { "base-reducer": 7 },
      })?.version,
    ).toBe(7);
    expect(
      modelUnavailableRefusal(gate, {
        documentId: "doc",
        model: MODEL,
        protocolVersions: { "base-reducer": 3 },
      })?.documentType,
    ).toBe(MODEL);
    expect(
      modelUnavailableRefusal(gate, {
        documentId: "doc",
        model: MODEL,
        protocolVersions: { "base-reducer": 2 },
      }),
    ).toBeUndefined();
  });

  it("runs a base-reducer number this build does not know as the highest version it runs", () => {
    const flagsOff = createProtocolGate(
      { "base-reducer": [1, 2, 7] },
      createTestRegistry(),
    );
    const flagsOn = createProtocolGate(
      { "base-reducer": [1, 2, 3, 7] },
      createTestRegistry(),
    );
    expect(flagsOff.capabilities({ "base-reducer": 7 })?.version).toBe(2);
    expect(flagsOn.capabilities({ "base-reducer": 7 })?.version).toBe(3);
    expect(flagsOn.capabilities({ "base-reducer": 1 })?.version).toBe(1);
    expect(flagsOn.capabilities({ signature: 1 })).toBeUndefined();
    expect(flagsOn.capabilities(undefined)).toBeUndefined();
    const header = (protocolVersions?: Record<string, number>) => ({
      id: "doc",
      protocolVersions,
    });
    expect(
      flagsOn.headerCapabilities(header({ "base-reducer": 7 }) as never)
        .version,
    ).toBe(3);
    expect(() => flagsOn.headerCapabilities(header() as never)).toThrow(
      "carries no base-reducer protocol version",
    );
  });

  it("falls back to the default flags' highest version without a base-reducer entry", () => {
    expect(
      baseReducerResolver({}).capabilities({ "base-reducer": 7 })?.version,
    ).toBe(2);
    expect(UNGATED.capabilities({ "base-reducer": 7 })?.version).toBe(2);
    const gate = createProtocolGate({ signature: [1] }, createTestRegistry());
    expect(gate.capabilities({ "base-reducer": 7 })?.version).toBe(2);
    expect(gate.refusal("doc", { "base-reducer": 7 }, MODEL)).toBeUndefined();
  });

  it("refuses the model check against the resolved version, naming the stored number", () => {
    const plain = (support: Record<string, number[]>) =>
      createProtocolGate(
        support,
        createTestRegistry([untagged(documentModelDocumentModelModule)]),
      );
    const wide = plain({ "base-reducer": [1, 2, 3, 7] });
    for (const refused of [
      wide.refusal("doc", { "base-reducer": 7 }, MODEL),
      wide.readRefusal("doc", { "base-reducer": 7 }, MODEL),
      plain({ "base-reducer": [1, 2, 3] }).readRefusal(
        "doc",
        { "base-reducer": 7 },
        MODEL,
      ),
    ]) {
      expect(refused).toMatchObject({
        name: "UnsupportedProtocolVersionError",
        version: 7,
        documentType: MODEL,
      });
    }
    expect(wide.refusalOf({ "base-reducer": 7 }, MODEL)).toEqual({
      protocol: "base-reducer",
      version: 7,
      documentType: MODEL,
    });
    expect(
      plain({ "base-reducer": [1, 2, 7] }).refusal(
        "doc",
        { "base-reducer": 7 },
        MODEL,
      ),
    ).toBeUndefined();
    expect(
      plain({ "base-reducer": [1, 2] }).readRefusal(
        "doc",
        { "base-reducer": 7 },
        MODEL,
      ),
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
    expect(() =>
      stateReducerOrRefusal(reducer, "doc", MODEL, 1, { "base-reducer": 7 }),
    ).toThrow(expect.objectContaining({ version: 7, documentType: MODEL }));
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
