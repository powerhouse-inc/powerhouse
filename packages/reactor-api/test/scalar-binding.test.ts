import type { IReactorClient } from "@powerhousedao/reactor";
import type { ILogger } from "document-model";
import {
  defineScalar,
  type storedScalarDefinition,
} from "document-model/scalars";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { packageScalarFindings } from "../src/graphql/document-model-schema/package-scalars.js";
import { StitchingGatewayAdapter } from "../src/graphql/gateway/adapter-gateway-stitching.js";
import type { ScalarRegistry } from "../src/utils/scalar-types.js";
import { asStored, Bic, boardModel, Iban } from "./utils/code-first-models.js";
import {
  makeDriveModule,
  makeHarness,
  makeHarnessLogger,
  makeMockReactorClient,
} from "./utils/graphql-manager-harness.js";

const PACKAGE = "@acme/banking";

const SET_OWNER = `mutation ($owner: Iban) {
  Board { setOwner(docId: "doc-1", input: { owner: $owner }) { id } }
}`;

let shutdown: (() => Promise<void>) | undefined;

afterEach(async () => {
  await shutdown?.();
  shutdown = undefined;
});

async function serveBoard(
  scalars: ScalarRegistry,
  logger = makeHarnessLogger(),
) {
  const executed: unknown[] = [];
  const { manager, mounts } = makeHarness({
    enableDocumentModelSubgraphs: true,
    logger,
    gatewayAdapter: new StitchingGatewayAdapter(logger),
    reactorClient: makeMockReactorClient({
      getDocumentModelModules: () =>
        Promise.resolve({ results: [makeDriveModule(), boardModel()] }),
      get: (id: string) =>
        Promise.resolve({ header: { id, documentType: "test/board" } }),
      executeAsync: (_id: string, _branch: string, actions: unknown[]) => {
        executed.push(...actions);
        return Promise.reject(new Error("not stored"));
      },
    } as unknown as Partial<IReactorClient>),
  });
  shutdown = () => manager.shutdown();
  await manager.init([], undefined, undefined, scalars);
  await manager.updateRouter();
  const post = async (query: string, variables?: Record<string, unknown>) => {
    const handler = mounts.get("/graphql/board");
    if (!handler)
      throw new Error(`Not mounted: ${[...mounts.keys()].join(", ")}`);
    const response = await handler(
      new Request("http://localhost/graphql/board", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
      }),
    );
    const body = (await response.json()) as {
      errors?: { message: string }[];
    };
    return (body.errors ?? []).map((error) => error.message);
  };
  return { manager, post, executed, logger };
}

const registry = (
  ...entries: (readonly [
    string,
    Parameters<typeof storedScalarDefinition>[0],
  ])[]
): ScalarRegistry =>
  new Map(
    entries.map(([name, definition]) => [
      name,
      { definition, packageName: PACKAGE },
    ]),
  );

const warnings = (logger: ILogger) =>
  vi.mocked(logger.warn).mock.calls.map((call) => call.slice(1));

describe("a code-first model's package scalars", () => {
  it("serves the registered binding, whose validator rejects a bad value", async () => {
    const { post, executed, logger } = await serveBoard(
      registry(["Iban", Iban], ["Bic", Bic]),
    );

    expect(await post(SET_OWNER, { owner: "not-an-iban" })).toEqual([
      'Variable "$owner" got invalid value "not-an-iban"; Expected type "Iban". Iban: ✖ Invalid string: must match pattern /^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/',
    ]);
    expect(executed).toEqual([]);
    expect(await post(SET_OWNER, { owner: "DE89370400440532013000" })).toEqual([
      "not stored",
    ]);
    expect(executed).toEqual([
      expect.objectContaining({
        type: "SET_OWNER",
        input: { owner: "DE89370400440532013000" },
      }),
    ]);
    expect(warnings(logger)).toEqual([]);
  });

  it("logs a binding whose stored metadata differs once, and serves it", async () => {
    const Renamed = defineScalar({
      name: "Iban",
      description: "Another account number.",
      schema: z.string(),
    });
    const { manager, post, logger } = await serveBoard(
      registry(["Iban", Renamed], ["Bic", Bic]),
    );
    await manager.regenerateDocumentModelSubgraphs();
    await manager.updateRouter();

    expect(warnings(logger)).toEqual([
      [
        "test/board",
        "Iban",
        '{"coercion":{"source":"derived"},"coercionProfile":"catalog-v1","description":"An international bank account number.","formatVersion":1,"kind":"powerhouse.scalar","name":"Iban","representation":"string"}',
        PACKAGE,
        '{"coercion":{"source":"derived"},"coercionProfile":"catalog-v1","description":"Another account number.","formatVersion":1,"kind":"powerhouse.scalar","name":"Iban","representation":"string"}',
      ],
    ]);
    const [refusal] = await post(SET_OWNER, { owner: "anything" });
    expect(refusal.split("\n")[0]).toBe("Invalid action input: [");
    expect(await post(SET_OWNER, { owner: "DE89370400440532013000" })).toEqual([
      "not stored",
    ]);
  });

  it("logs a missing binding once, and serves the model", async () => {
    const { manager, post, logger } = await serveBoard(
      registry(["Iban", Iban]),
    );
    await manager.regenerateDocumentModelSubgraphs();
    await manager.updateRouter();

    expect(warnings(logger)).toEqual([["test/board", "Bic"]]);
    expect(
      await post(`mutation {
        Board { setDraft(docId: "doc-1", input: { draft: "d", bank: "ANY" }) { id } }
      }`),
    ).toEqual(["not stored"]);
  });
});

describe("packageScalarFindings", () => {
  it("reports the unbound scalars of a model served from its definition only", () => {
    expect(
      packageScalarFindings(
        [asStored(boardModel()), boardModel()],
        registry(["Iban", Iban]),
      ),
    ).toEqual([{ kind: "unbound", documentType: "test/board", scalar: "Bic" }]);
  });
});
