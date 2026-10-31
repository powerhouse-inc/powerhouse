import type { Action } from "@powerhousedao/shared/document-model";
import { pascalCase } from "change-case";
import { describe, expect, it } from "vitest";
import {
  defineDocumentModel,
  materialize,
  ph,
} from "../../../src/definition/index.js";
import { documentModelScalars } from "../../../src/scalars/catalog.js";
import { catalogScalarCases } from "../../scalars/catalog-cases.js";

const names = documentModelScalars.map((definition) => definition.name);
const operationKey = (name: string) => `set${pascalCase(name)}`;

const context = defineDocumentModel({
  id: "test/scalars",
  name: "Scalars",
  description: "One field and one setter per catalog scalar.",
  extension: "scalars",
  version: 1,
  author: { name: "Powerhouse" },
  scopes: {
    global: {
      schema: ph.object("ScalarsState", {
        fields: Object.fromEntries(
          documentModelScalars.map((definition) => [
            definition.name,
            ph.scalar(definition),
          ]),
        ) as never,
      }),
      initialValue: Object.fromEntries(
        names.map((name) => [name, null]),
      ) as never,
    },
    local: { schema: null, initialValue: {} },
  },
});

const setters = context.module("setters", {
  operations: ({ global }) =>
    Object.fromEntries(
      documentModelScalars.map((definition) => [
        operationKey(definition.name),
        global({
          input: ph.input({
            fields: { value: ph.scalar(definition, { required: true }) },
          }),
          reduce(state: Record<string, unknown>, input: { value: unknown }) {
            state[definition.name] = input.value;
          },
        }),
      ]),
    ) as never,
});

const model = materialize(context.version({ modules: [setters] }));

type Case = { readonly value: unknown; readonly accepted: boolean };

function casesOf(name: string): readonly Case[] {
  const { accepts, rejects } = catalogScalarCases[name];
  return [
    ...accepts.map((value) => ({ value, accepted: true })),
    ...rejects.map((value) => ({ value, accepted: false })),
  ];
}

const actions = model.actions as unknown as Record<
  string,
  (input: unknown) => Action
>;

function creatorAccepts(name: string, value: unknown): boolean {
  try {
    actions[operationKey(name)]({ value });
    return true;
  } catch {
    return false;
  }
}

const actionTypes = new Map(
  names.map((name) => [
    name,
    actions[operationKey(name)]({ value: catalogScalarCases[name].accepts[0] })
      .type,
  ]),
);

function persistedAction(name: string, value: unknown, index: number): Action {
  return {
    id: `case-${name}-${index}`,
    type: actionTypes.get(name),
    input: { value },
    scope: "global",
    timestampUtcMs: new Date(1_700_000_000_000 + index).toISOString(),
  } as unknown as Action;
}

describe("a catalog scalar in a code-first model", () => {
  it("has a setter per scalar the catalog offers a document model", () => {
    expect([...actionTypes]).toStrictEqual([
      ["Unknown", "SET_UNKNOWN"],
      ["DateTime", "SET_DATE_TIME"],
      ["Address", "SET_ADDRESS"],
      ["AttachmentRef", "SET_ATTACHMENT_REF"],
      ["Amount_Tokens", "SET_AMOUNT_TOKENS"],
      ["EthereumAddress", "SET_ETHEREUM_ADDRESS"],
      ["EmailAddress", "SET_EMAIL_ADDRESS"],
      ["Amount_Percentage", "SET_AMOUNT_PERCENTAGE"],
      ["Date", "SET_DATE"],
      ["URL", "SET_URL"],
      ["Amount_Money", "SET_AMOUNT_MONEY"],
      ["OLabel", "SET_O_LABEL"],
      ["Currency", "SET_CURRENCY"],
      ["PHID", "SET_PHID"],
      ["OID", "SET_OID"],
      ["Amount_Fiat", "SET_AMOUNT_FIAT"],
      ["Amount_Currency", "SET_AMOUNT_CURRENCY"],
      ["Amount_Crypto", "SET_AMOUNT_CRYPTO"],
      ["Amount", "SET_AMOUNT"],
      ["Upload", "SET_UPLOAD"],
    ]);
  });

  it.each(names)(
    "is refused by the action creator where the catalog refuses it: %s",
    (name) => {
      for (const [index, { value, accepted }] of casesOf(name).entries()) {
        expect(creatorAccepts(name, value), `${name} case ${index}`).toBe(
          accepted,
        );
      }
    },
  );

  it.each(names)(
    "is refused by the reducer for a persisted action where the catalog refuses it: %s",
    (name) => {
      let document = model.utils.createDocument();
      for (const [index, { value, accepted }] of casesOf(name).entries()) {
        const where = `${name} case ${index}`;
        const before = (document.state.global as Record<string, unknown>)[name];
        document = model.reducer(document, persistedAction(name, value, index));
        const operation = document.operations.global.at(-1);
        expect(operation?.error === undefined, where).toBe(accepted);
        expect(
          (document.state.global as Record<string, unknown>)[name],
          where,
        ).toStrictEqual(accepted ? value : before);
      }
    },
  );

  it.each(names)(
    "is refused by state validation where the catalog refuses it: %s",
    (name) => {
      for (const [index, { value, accepted }] of casesOf(name).entries()) {
        const state = model.utils.createState({
          global: { [name]: value } as never,
        });
        expect(model.utils.isStateOfType(state), `${name} case ${index}`).toBe(
          accepted || value === null || value === undefined,
        );
      }
    },
  );
});
