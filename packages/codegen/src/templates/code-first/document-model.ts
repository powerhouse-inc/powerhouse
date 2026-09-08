import { ts } from "@tmpl/core";

export type CodeFirstDocumentModelTemplateVariables = {
  camelCaseName: string;
  descriptionLiteral: string;
  extensionLiteral: string;
  idLiteral: string;
  name: string;
  nameLiteral: string;
  organizationLiteral: string;
  pascalCaseName: string;
  version: number;
};

export const codeFirstModelTemplate = (
  v: CodeFirstDocumentModelTemplateVariables,
) =>
  ts`
import {
  defineDocumentModel,
  ph,
  type SourceOf,
} from "document-model";
import { setValueReducer } from "./reducers.js";

export const ${v.camelCaseName}StateSchema = ph.object(
  "${v.pascalCaseName}State",
  {
    fields: {
      value: ph.String({ required: true }),
    },
  },
);

export const initialGlobalState = {
  value: "",
} satisfies SourceOf<typeof ${v.camelCaseName}StateSchema>;

export const setValueInput = ph.input({
  fields: {
    value: ph.String({ required: true }),
  },
});

const ${v.camelCaseName}V${v.version} = defineDocumentModel({
  id: ${v.idLiteral},
  name: ${v.nameLiteral},
  description: ${v.descriptionLiteral},
  extension: ${v.extensionLiteral},
  version: ${v.version},
  author: { name: ${v.organizationLiteral} },
  changeLog: [],
  specifications: {
    global: {
      schema: ${v.camelCaseName}StateSchema,
      initialValue: initialGlobalState,
      examples: [],
    },
    local: { schema: null, initialValue: {}, examples: [] },
  },
});

export const generalOperations = ${v.camelCaseName}V${v.version}.module(
  "generalOperations",
  {
    description: "General ${v.name} operations.",
    operations: ({ global }) => ({
      setValue: global({
        input: setValueInput,
        reduce: setValueReducer,
      }),
    }),
  },
);

export const ${v.camelCaseName}V${v.version}Definition =
  ${v.camelCaseName}V${v.version}.version({
    modules: [generalOperations],
  });
`.raw;

export const codeFirstReducersTemplate = (
  v: CodeFirstDocumentModelTemplateVariables,
) =>
  ts`
import type { InputOf, Mutable, SourceOf } from "document-model";
import type {
  ${v.camelCaseName}StateSchema,
  setValueInput,
} from "./model.js";

type GlobalState = Mutable<SourceOf<typeof ${v.camelCaseName}StateSchema>>;
type SetValueInput = Mutable<InputOf<typeof setValueInput>>;

export function setValueReducer(
  state: GlobalState,
  input: SetValueInput,
): void {
  state.value = input.value;
}
`.raw;

export const codeFirstRootIndexTemplate = (
  v: CodeFirstDocumentModelTemplateVariables,
) =>
  ts`
import {
  defineDocumentModelFamily,
  type UpgradeManifest,
} from "document-model";
import { upgrades } from "./upgrades/index.js";
import { ${v.camelCaseName}V${v.version}Definition } from "./v${v.version}/model.js";

const versions = [${v.camelCaseName}V${v.version}Definition] as const;

export const ${v.pascalCaseName}Family = defineDocumentModelFamily({
  versions,
  upgrades,
});

export const ${v.pascalCaseName}V${v.version} =
  ${v.pascalCaseName}Family.at(${v.version});

export const ${v.camelCaseName}UpgradeManifest: UpgradeManifest<
  readonly number[]
> = ${v.pascalCaseName}Family.upgradeManifest;
`.raw;

export const codeFirstUpgradesIndexTemplate = () =>
  ts`
export const upgrades = [] as const;
`.raw;

export const codeFirstUpgradeTransitionTemplate = (
  v: CodeFirstDocumentModelTemplateVariables,
) =>
  ts`
import type { UpgradeTransition } from "document-model";

export const upgradeToV${v.version}: UpgradeTransition = {
  toVersion: ${v.version},
  description: "Upgrade ${v.name} documents to version ${v.version}.",
  upgradeReducer(document) {
    // Update persisted state here when version ${v.version} changes its shape.
    return document;
  },
};
`.raw;

export const codeFirstUpgradeTestTemplate = (
  v: CodeFirstDocumentModelTemplateVariables,
) =>
  ts`
import { describe, expect, it } from "vitest";
import type { Action } from "document-model";
import { ${v.pascalCaseName}V${v.version - 1} } from "../index.js";
import { upgradeToV${v.version} } from "./v${v.version}.js";

describe("${v.pascalCaseName} upgrade to v${v.version}", () => {
  it("runs the upgrade reducer", () => {
    const document = ${v.pascalCaseName}V${v.version - 1}.utils.createDocument();
    const action = {
      id: "upgrade-to-v${v.version}",
      type: "UPGRADE_DOCUMENT",
      timestampUtcMs: "1970-01-01T00:00:00.000Z",
      input: {},
      scope: "document",
    } satisfies Action;
    expect(() =>
      upgradeToV${v.version}.upgradeReducer(document, action),
    ).not.toThrow();
  });
});
`.raw;

export const codeFirstModelTestTemplate = (
  v: CodeFirstDocumentModelTemplateVariables,
) =>
  ts`
import { describe, expect, it } from "vitest";
import { ${v.pascalCaseName}V${v.version} } from "../../index.js";

describe("${v.pascalCaseName} v${v.version}", () => {
  it("creates a versioned document with the initial state", () => {
    const document = ${v.pascalCaseName}V${v.version}.utils.createDocument();

    expect(document.header.documentType).toBe(${v.idLiteral});
    expect(document.state.document.version).toBe(${v.version});
    expect(document.state.global).toEqual({ value: "" });
  });

  it("reduces its operations through the public model module", () => {
    const document = ${v.pascalCaseName}V${v.version}.utils.createDocument();
    const updated = ${v.pascalCaseName}V${v.version}.reducer(
      document,
      ${v.pascalCaseName}V${v.version}.actions.setValue({ value: "Example" }),
    );

    expect(updated.state.global.value).toBe("Example");
  });
});
`.raw;
