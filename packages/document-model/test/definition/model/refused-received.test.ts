import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
  materialize,
  ph,
} from "../../../src/definition/index.js";
import { defineScalar } from "../../../src/scalars/define-scalar.js";
import { diagnosticsOf } from "../helpers/diagnostics.js";

function receivedAt(
  diagnostics: readonly DefinitionDiagnostic[],
  path: string,
): string | undefined {
  return diagnostics.find((entry) => entry.path.join(".") === path)?.received;
}

const state = () =>
  ph.object("SampleState", {
    fields: { title: ph.String({ required: true }) },
  });

function config(overrides: Record<string, unknown> = {}) {
  return {
    id: "test/sample",
    name: "Sample",
    description: "",
    extension: "sample",
    version: 1,
    author: { name: "Powerhouse" },
    specifications: {
      global: { schema: state(), initialValue: { title: "" } },
      local: { schema: null, initialValue: {} },
    },
    ...overrides,
  } as never;
}

function specifications(global: Record<string, unknown>, extra = {}) {
  return {
    ...extra,
    global: { schema: state(), initialValue: { title: "" }, ...global },
    local: { schema: null, initialValue: {} },
  };
}

const versionAt = (version: number) =>
  defineDocumentModel(config({ version })).version({ modules: [] });

function familyWith(manifest: Record<string, unknown>) {
  return () =>
    defineDocumentModelFamily({
      versions: [versionAt(1), versionAt(2)],
      upgradeManifest: {
        documentType: "test/sample",
        latestVersion: 2,
        supportedVersions: [1, 2],
        upgrades: { v2: { toVersion: 2, upgradeReducer: () => undefined } },
        ...manifest,
      },
    } as never);
}

function revokedProxy(): object {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  return proxy;
}

function refusals(value: unknown): Record<string, string | undefined> {
  const declaration = diagnosticsOf(() =>
    defineDocumentModel(
      config({
        id: value,
        name: value,
        description: value,
        extension: value,
        version: value,
        author: { name: value },
      }),
    ),
  );
  const model = defineDocumentModel(config());
  return {
    id: receivedAt(declaration, "id"),
    name: receivedAt(declaration, "name"),
    description: receivedAt(declaration, "description"),
    extension: receivedAt(declaration, "extension"),
    version: receivedAt(declaration, "version"),
    "author.name": receivedAt(declaration, "author.name"),
    "specifications.global.schema": receivedAt(
      diagnosticsOf(() =>
        defineDocumentModel(
          config({ specifications: specifications({ schema: value }) }),
        ),
      ),
      "specifications.global.schema",
    ),
    "specifications.global.examples.0.value": receivedAt(
      diagnosticsOf(() =>
        defineDocumentModel(
          config({
            specifications: specifications({
              examples: [{ key: "first", value }],
            }),
          }),
        ),
      ),
      "specifications.global.examples.0.value",
    ),
    "module.operations": receivedAt(
      diagnosticsOf(() => model.module("m", { operations: value as never })),
      "module.operations",
    ),
    "operations.input": receivedAt(
      diagnosticsOf(() =>
        model.module("m", {
          operations: ({ global }) => ({
            op: global({ input: value, reduce() {} } as never),
          }),
        }),
      ),
      "operations.input",
    ),
    "operations.reduce": receivedAt(
      diagnosticsOf(() =>
        model.module("m", {
          operations: ({ global }) => ({
            op: global({
              input: ph.input({ fields: {} }),
              reduce: value,
            } as never),
          }),
        }),
      ),
      "operations.reduce",
    ),
    "upgradeManifest.upgrades.v2.upgradeReducer": receivedAt(
      diagnosticsOf(
        familyWith({
          upgrades: { v2: { toVersion: 2, upgradeReducer: value } },
        }),
      ),
      "upgradeManifest.upgrades.v2.upgradeReducer",
    ),
  };
}

const SITES = [
  "id",
  "name",
  "description",
  "extension",
  "version",
  "author.name",
  "specifications.global.schema",
  "specifications.global.examples.0.value",
  "module.operations",
  "operations.input",
  "operations.reduce",
  "upgradeManifest.upgrades.v2.upgradeReducer",
];

describe("a refused author value", () => {
  it("reads as null wherever null is refused", () => {
    expect(refusals(null)).toStrictEqual(
      Object.fromEntries(SITES.map((site) => [site, "null"])),
    );
  });

  it("reads as array wherever an array is refused", () => {
    expect(refusals([])).toStrictEqual(
      Object.fromEntries(SITES.map((site) => [site, "array"])),
    );
  });

  it("reads as null or array where only one of them is refused", () => {
    expect([
      receivedAt(
        diagnosticsOf(familyWith({ supportedVersions: null })),
        "upgradeManifest.supportedVersions",
      ),
      receivedAt(
        diagnosticsOf(() =>
          defineDocumentModel(
            config({ author: { name: "Powerhouse", website: [] } }),
          ),
        ),
        "author.website",
      ),
    ]).toStrictEqual(["null", "array"]);
  });

  it("reads as null, array, or its type at the remaining family sites", () => {
    const first = (run: () => unknown) => {
      const [diagnostic] = diagnosticsOf(run);
      return [diagnostic.path.join("."), diagnostic.received];
    };
    const upgrade = (toVersion: unknown) =>
      familyWith({
        upgrades: { v2: { toVersion, upgradeReducer: () => undefined } },
      });
    expect([
      first(familyWith({ documentType: [] })),
      first(familyWith({ latestVersion: [] })),
      first(upgrade([])),
      first(upgrade(Object.create(null))),
    ]).toStrictEqual([
      ["upgradeManifest.documentType", "array"],
      ["upgradeManifest.latestVersion", "array"],
      ["upgradeManifest.upgrades.v2.toVersion", "array"],
      ["upgradeManifest.upgrades.v2.toVersion", "object"],
    ]);
  });

  it("reads as the value's type where a declaration record belongs", () => {
    expect(
      [null, []].flatMap((value) =>
        diagnosticsOf(() => defineDocumentModel(value as never)).map(
          ({ code, path, received }) => [code, path.join("."), received],
        ),
      ),
    ).toStrictEqual([
      ["PH-DM-DECLARATION-INVALID", "", "null"],
      ["PH-DM-DECLARATION-INVALID", "", "array"],
    ]);
  });
});

describe("a declaration that cannot be inspected", () => {
  it("is refused by defineDocumentModel with a diagnostic", () => {
    const local = (initialValue: unknown) =>
      config({
        specifications: {
          global: { schema: state(), initialValue: { title: "" } },
          local: { schema: null, initialValue },
        },
      });
    const refusal = (input: unknown) =>
      diagnosticsOf(() => defineDocumentModel(input as never)).map(
        ({ code, path, received }) => [code, path.join("."), received],
      );
    const initialValue = "specifications.local.initialValue";

    expect([
      ...refusal(revokedProxy()),
      ...refusal(config({ id: revokedProxy() })),
      ...refusal(config({ specifications: revokedProxy() })),
      ...refusal(local(revokedProxy())),
      ...refusal(local(null)),
      ...refusal(local([])),
      ...refusal(local(0)),
      ...refusal(local({ note: null })),
      ...refusal(local(Object.create({ note: null }))),
      ...refusal(local(Object.create(null))),
    ]).toStrictEqual([
      ["PH-DM-DECLARATION-INVALID", "", "inspection-failed"],
      ["PH-DM-DECLARATION-INVALID", "id", "inspection-failed"],
      ["PH-DM-DECLARATION-INVALID", "specifications", "inspection-failed"],
      ["PH-DM-INITIAL-VALUE-INVALID", initialValue, "inspection-failed"],
      ["PH-DM-INITIAL-VALUE-INVALID", initialValue, "null"],
      ["PH-DM-INITIAL-VALUE-INVALID", initialValue, "array"],
      ["PH-DM-INITIAL-VALUE-INVALID", initialValue, "number"],
      ["PH-DM-INITIAL-VALUE-INVALID", initialValue, "a nonempty object"],
      [
        "PH-DM-INITIAL-VALUE-INVALID",
        initialValue,
        "an object whose prototype is not Object.prototype",
      ],
      [
        "PH-DM-INITIAL-VALUE-INVALID",
        initialValue,
        "an object whose prototype is not Object.prototype",
      ],
    ]);
  });

  it("refuses an operation map or an error map whose keys cannot be read", () => {
    const model = defineDocumentModel(config());
    const keysThrow = () =>
      new Proxy(
        {},
        {
          ownKeys() {
            throw new Error("ownKeys trap ran");
          },
        },
      );
    const refusal = (declare: () => unknown) =>
      diagnosticsOf(declare).map(({ code, path, received }) => [
        code,
        path.join("."),
        received,
      ]);

    expect([
      ...refusal(() =>
        model.module("broken", { operations: () => keysThrow() as never }),
      ),
      ...refusal(() =>
        model.module("broken", {
          operations: ({ global }) => ({
            rename: global({
              input: ph.input({ fields: {} }),
              errors: keysThrow() as never,
              reduce() {},
            }),
          }),
        }),
      ),
    ]).toStrictEqual([
      ["PH-DM-DECLARATION-INVALID", "module.operations", "inspection-failed"],
      ["PH-DM-DECLARATION-INVALID", "operations.errors", "inspection-failed"],
    ]);
  });

  it("refuses auxiliary types that are not a readable plain array", () => {
    expect(
      diagnosticsOf(() =>
        defineDocumentModel(
          config({
            specifications: specifications(
              {},
              { auxiliaryTypes: new (class extends Array {})() },
            ),
          }),
        ),
      ).map(({ repair }) => repair),
    ).toStrictEqual([
      "Pass an array literal, or copy the array with Array.from(...).",
    ]);
    class Sub extends Array {}
    const unreadableLength = new Proxy([], {
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        return key === "length" ? { ...descriptor, value: -1 } : descriptor;
      },
    });
    expect(
      [new Sub(), runInNewContext("[]") as unknown, unreadableLength].flatMap(
        (auxiliaryTypes) =>
          diagnosticsOf(() =>
            defineDocumentModel(
              config({
                specifications: specifications({}, { auxiliaryTypes }),
              }),
            ),
          ).map(({ code, path, message, received, repair }) => [
            code,
            path.join("."),
            message,
            received,
            repair,
          ]),
      ),
    ).toStrictEqual([
      [
        "PH-DM-DECLARATION-INVALID",
        "specifications.auxiliaryTypes",
        "Expected a plain array, not an Array subclass or an array from another realm.",
        "array of another prototype or realm",
        "Pass an array literal, or copy the array with Array.from(...).",
      ],
      [
        "PH-DM-DECLARATION-INVALID",
        "specifications.auxiliaryTypes",
        "Expected a plain array, not an Array subclass or an array from another realm.",
        "array of another prototype or realm",
        "Pass an array literal, or copy the array with Array.from(...).",
      ],
      [
        "PH-DM-DECLARATION-INVALID",
        "specifications.auxiliaryTypes",
        "The option value could not be snapshotted (inspection-failed).",
        "inspection-failed",
        "Pass an array literal of data values with no holes, extra properties, accessors, or proxies.",
      ],
    ]);
  });
});

describe("a specifications value that is not the scope map", () => {
  it("is refused once per mistake", () => {
    const withHidden = specifications({});
    Object.defineProperty(withHidden, "custom", {
      value: {},
      enumerable: false,
    });
    const refusal = (value: unknown) =>
      diagnosticsOf(() =>
        defineDocumentModel(config({ specifications: value })),
      ).map(({ code, path, message, received }) => [
        code,
        path.join("."),
        message,
        received,
      ]);
    const scope = (key: string) => [
      "PH-DM-SCOPE-UNSUPPORTED",
      `specifications.${key}`,
      `Scope "${key}" cannot be declared; DocumentSpecification.state describes global and local only.`,
      key,
    ];

    expect([
      refusal([]),
      refusal(new String("ab")),
      refusal(withHidden),
      refusal(specifications({}, { custom: {} })),
      refusal(specifications({}, { auth: {} })),
    ]).toStrictEqual([
      [
        [
          "PH-DM-DECLARATION-INVALID",
          "specifications",
          "The option value could not be snapshotted (not-record).",
          "array",
        ],
      ],
      [
        [
          "PH-DM-DECLARATION-INVALID",
          "specifications",
          "The option value could not be snapshotted (custom-prototype).",
          "object",
        ],
      ],
      [scope("custom")],
      [scope("custom")],
      [
        [
          "PH-AUTH-UNSUPPORTED",
          "specifications.auth",
          "A document model cannot declare authorization; core V1 rejects a model auth declaration.",
          "auth",
        ],
      ],
    ]);
  });
});

describe("a legitimate declaration", () => {
  it("still declares with plain objects, plain arrays, frozen objects, and undefined members", () => {
    const Probe = defineScalar(
      Object.freeze({
        name: "Probe",
        description: "A probe scalar.",
        schema: z.string(),
      }),
    );
    const model = materialize(
      defineDocumentModel(
        Object.freeze(
          config({
            changeLog: ["first"],
            author: Object.freeze({ name: "Powerhouse", website: undefined }),
            specifications: Object.freeze({
              global: Object.freeze({
                schema: ph.object("SampleState", {
                  fields: Object.freeze({
                    title: ph.scalar(Probe),
                    tags: ph.list(ph.String()),
                  }),
                }),
                initialValue: { title: null, tags: [] },
                examples: [Object.freeze({ key: "first", value: "{}" })],
              }),
              local: Object.freeze({
                schema: null,
                initialValue: Object.freeze({}),
              }),
            }),
          }),
        ),
      ).version({ modules: [] }),
    );

    expect([
      model.definition.model.documentType,
      model.definition.specifications.map(({ version, scalars }) => [
        version,
        scalars.map(({ name }) => name),
      ]),
      model.documentModel.global.specifications[0].state.global.schema,
    ]).toStrictEqual([
      "test/sample",
      [[1, ["Probe"]]],
      "scalar Probe\n\ntype SampleState {\n  title: Probe\n  tags: [String]\n}\n",
    ]);
  });
});
