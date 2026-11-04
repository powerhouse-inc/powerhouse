import type { Action } from "document-model";
import {
  defineDocumentModel,
  documentModelDocumentModelModule,
  inspectDocumentModelDefinition,
  materialize,
  ph,
} from "document-model";
import { describe, expect, it } from "vitest";
import { WorkerPackageLoader } from "../src/rpc/worker-package-loader.js";

const ledger = defineDocumentModel({
  id: "test/ledger",
  name: "Ledger",
  description: "A running total.",
  extension: "ledger",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  scopes: {
    global: {
      schema: ph.object("LedgerState", {
        fields: { total: ph.Int({ required: true }) },
      }),
      initialValue: { total: 0 },
    },
    local: { schema: null, initialValue: {} },
  },
});

const Ledger = materialize(
  ledger.version({
    modules: [
      ledger.module("amounts", {
        operations: ({ global }) => ({
          addAmount: global({
            input: ph.input({ fields: { amount: ph.Int({ required: true }) } }),
            reduce(state, input) {
              state.total += input.amount;
            },
          }),
        }),
      }),
    ],
  }),
);

describe("WorkerPackageLoader", () => {
  it("loads a package that mixes code-first and schema-first models", async () => {
    const loader = new WorkerPackageLoader({
      cdnUrl: "https://cdn.test",
      fetchSource: () => Promise.resolve("export {};"),
      importPackage: (url) =>
        url.includes("/mixed@")
          ? Promise.resolve({ Ledger, documentModelDocumentModelModule })
          : Promise.reject(new Error(`404 ${url}`)),
    });
    await loader.loadPackages(["mixed@1.0.0"]);
    expect(
      loader.models.map((module) => ({
        type: module.documentModel.global.id,
        kind: inspectDocumentModelDefinition(module).kind,
      })),
    ).toEqual([
      { type: "test/ledger", kind: "structured" },
      { type: "powerhouse/document-model", kind: "stored" },
    ]);

    const module = await loader.load("test/ledger");
    const addAmount = (
      module.actions as unknown as Record<string, (input: unknown) => Action>
    ).addAmount({ amount: 4 });
    expect(addAmount.type).toBe("ADD_AMOUNT");
    expect(
      module.reducer(module.utils.createDocument(), addAmount).state,
    ).toMatchObject({ global: { total: 4 } });
  });
});
