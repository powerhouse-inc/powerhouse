import type {
  DocumentModelDefinition,
  DocumentModelModule,
  JsonValue,
  PowerhouseScalarName,
} from "@powerhousedao/shared/document-model";
import { camelCase, pascalCase } from "change-case";
import { defineDocumentModel, ph, scalarCatalog } from "document-model";
import { SCALAR_CASES, type ScalarCase } from "./scalar-cases.js";

/**
 * One model carrying a field and a setter for every scalar the catalog knows.
 *
 * Any claim about a scalar's behaviour — what document creation accepts, what
 * a reducer accepts, what replay reproduces, what GraphQL coerces — is a claim
 * about a *model*, so it has to be measured through one. Building it here, off
 * the catalog rather than off a transcribed list, means adding a scalar to the
 * catalog adds it to every suite that uses this.
 *
 * Imported by `packages/reactor-api` as well, which is why it reaches for the
 * compiler by its published name: both packages must get the same catalog
 * instance, and a relative source path would hand one of them a second copy.
 */

type ScalarFactory = ((options?: unknown) => unknown) & {
  readonly kind?: string;
  readonly declaration?: { readonly name?: string };
};

/**
 * The builder for each catalog scalar, discovered rather than transcribed.
 *
 * `ph` also carries factories for the GraphQL built-ins, which are not catalog
 * scalars and carry no declaration; only the ones naming a catalog entry are
 * taken.
 */
export const SCALAR_FACTORIES: ReadonlyMap<
  string,
  { readonly builder: string; readonly make: ScalarFactory }
> = new Map(
  Object.entries(ph as unknown as Record<string, unknown>).flatMap(
    ([builder, value]) => {
      const factory = value as ScalarFactory;
      const name = factory.declaration?.name;
      return typeof factory === "function" &&
        factory.kind === "scalar-factory" &&
        name !== undefined
        ? [[name, { builder, make: factory }] as const]
        : [];
    },
  ),
);

export const CATALOG_SCALARS: readonly string[] = [...scalarCatalog.names];

/** The state field, and the input field, each scalar is carried by. */
export function fieldNameFor(name: string): string {
  return camelCase(SCALAR_FACTORIES.get(name)!.builder);
}

/**
 * The operation key, spelled the way the compiler derives names.
 *
 * `setPHID` would derive the creator key `setPhid`, and the compiler rejects
 * an operation whose typed and runtime creator keys would differ.
 */
export function operationKeyFor(name: string): string {
  return `set${pascalCase(SCALAR_FACTORIES.get(name)!.builder)}`;
}

/** The action type the setter for one scalar dispatches. */
export function actionTypeFor(
  module: DocumentModelModule,
  name: string,
): string {
  const specification = (
    module as unknown as { definition: DocumentModelDefinition }
  ).definition.specifications.at(-1)!;
  for (const module_ of specification.modules) {
    for (const operation of module_.operations) {
      if (operation.key === operationKeyFor(name)) return operation.actionType;
    }
  }
  throw new Error(`no setter for ${name}`);
}

export function buildScalarsModel(): DocumentModelModule {
  const stateFields: Record<string, unknown> = {};
  const initialValue: Record<string, unknown> = {};
  for (const name of CATALOG_SCALARS) {
    stateFields[fieldNameFor(name)] = SCALAR_FACTORIES.get(name)!.make();
    initialValue[fieldNameFor(name)] = null;
  }

  const context = defineDocumentModel({
    id: "test/scalars",
    name: "Scalars",
    description: "One field and one setter per catalog scalar.",
    extension: "scalars",
    version: 1,
    author: { name: "Powerhouse", website: null },
    specifications: {
      global: {
        schema: ph.object("ScalarsState", { fields: stateFields as never }),
        initialValue: initialValue as never,
      },
      local: { schema: null, initialValue: {} },
    },
  });

  const setters = context.module("setters", {
    operations: ({ global }) =>
      Object.fromEntries(
        CATALOG_SCALARS.map((name) => {
          const builder = pascalCase(SCALAR_FACTORIES.get(name)!.builder);
          const field = fieldNameFor(name);
          return [
            operationKeyFor(name),
            global({
              input: ph.input(`Set${builder}Input`, {
                fields: {
                  value: SCALAR_FACTORIES.get(name)!.make({ required: true }),
                } as never,
              }),
              reduce(state: Record<string, unknown>, input: unknown) {
                state[field] = (input as { value: unknown }).value;
              },
            }),
          ];
        }),
      ) as never,
  });

  return context.finalize({
    modules: [setters],
  }) as unknown as DocumentModelModule;
}

/** The mutation field and namespaced input type the host derives per scalar. */
export function requestShapes(
  module: DocumentModelModule,
): ReadonlyMap<string, { readonly field: string; readonly inputType: string }> {
  const specification = (
    module as unknown as { definition: DocumentModelDefinition }
  ).definition.specifications.at(-1)!;
  const byKey = new Map(
    specification.modules.flatMap((module_) =>
      module_.operations.map(
        (operation) => [operation.key, operation] as const,
      ),
    ),
  );
  return new Map(
    CATALOG_SCALARS.map((name) => {
      const operation = byKey.get(operationKeyFor(name))!;
      return [
        name,
        {
          field: camelCase(operation.name!),
          inputType: `Scalars_${operation.input!.name}`,
        },
      ] as const;
    }),
  );
}

export type JsonCase = {
  readonly id: string;
  readonly value: JsonValue;
  readonly partition: "accepts" | "rejects";
};

/**
 * A `bigint`, a `Date`, a `Map`, an absent value, and an upload fixture have
 * no GraphQL spelling and no JSON spelling at all, so they belong to the
 * document validator's own suite rather than to anything that serializes.
 */
export function jsonCases(name: string): readonly JsonCase[] {
  const { accepts, rejects } = SCALAR_CASES[name as PowerhouseScalarName];
  const take = (
    cases: readonly ScalarCase[],
    partition: "accepts" | "rejects",
  ): JsonCase[] =>
    cases.flatMap((entry) =>
      entry.input.kind === "json"
        ? [{ id: entry.id, value: entry.input.value, partition }]
        : [],
    );
  return [...take(accepts, "accepts"), ...take(rejects, "rejects")];
}

/** Renders a JSON value as the GraphQL literal a client would have typed. */
export function literalSource(value: JsonValue): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const items = value as readonly JsonValue[];
    return `[${items.map((item) => literalSource(item)).join(", ")}]`;
  }
  if (typeof value === "object") {
    const fields = Object.entries(value).map(
      ([key, item]) => `${key}: ${literalSource(item as JsonValue)}`,
    );
    return `{ ${fields.join(", ")} }`;
  }
  return JSON.stringify(value);
}
