/** Compiles the converted descriptors in process and compares the schema they serve with the schema-first SDL. */
import {
  compileSubgraph,
  createSubgraphEntryBuilders,
  hostScalars,
  ph,
  projectSubgraphGraphQL,
} from "document-model";
import { defineScalar } from "document-model/scalars";
import { type DocumentNode, parse, type TypeDefinitionNode } from "graphql";
import { z } from "zod";
import {
  description,
  type FieldOptions,
  type Model,
  sdlLine,
} from "./analysis.js";
import {
  BUILT_IN_SCALARS,
  isRootName,
  refuse,
  Refused,
  type SdlSource,
} from "./context.js";
import { KIND_BUILDERS, walk } from "./schema-emission.js";
import { sortedSchemaText } from "./sdl.js";

/**
 * Builds the converted subgraph's descriptors and entries in this process,
 * compiles them as the host does and compares the schema they serve with
 * the schema-first SDL. A project scalar stands in as a scalar of its name.
 */
export function checkStaticParity(
  model: Model,
  subgraphName: string,
  sdl: string,
  source: SdlSource,
) {
  const builders = createSubgraphEntryBuilders<unknown, unknown, unknown>();
  const built = new Map<string, unknown>();
  const phRecord = ph as unknown as Readonly<
    Record<string, (...args: readonly unknown[]) => unknown>
  >;
  const fieldOptions = (field: FieldOptions) => ({
    ...(field.required && { required: true }),
    ...(field.description !== undefined && { description: field.description }),
    ...(field.deprecated !== undefined && { deprecated: field.deprecated }),
    ...(Object.hasOwn(field, "defaultValue") && {
      defaultValue: field.defaultValue,
    }),
  });
  const standIns = new Map<string, unknown>();
  const resolver = () => undefined;
  let compiled: ReturnType<typeof compileSubgraph>;
  try {
    const { entries } = walk<unknown, unknown, unknown>(model, {
      scalar(scalar, field) {
        if (scalar.kind === "host") {
          return (
            hostScalars as unknown as Readonly<
              Record<string, (...args: readonly unknown[]) => unknown>
            >
          )[scalar.builder](fieldOptions(field));
        }
        if (scalar.kind !== "project")
          return phRecord[scalar.builder](fieldOptions(field));
        let standIn = standIns.get(scalar.exportName);
        if (standIn === undefined) {
          standIn = defineScalar({
            name: scalar.exportName,
            schema: z.union([z.string(), z.number(), z.boolean()]),
          });
          standIns.set(scalar.exportName, standIn);
        }
        return phRecord.scalar(standIn, fieldOptions(field));
      },
      ref(typeName, _declared, field) {
        return phRecord.ref(() => built.get(typeName), fieldOptions(field));
      },
      list(item, field) {
        return phRecord.list(item, fieldOptions(field));
      },
      type(definition, members) {
        const name = definition.name.value;
        const builder = KIND_BUILDERS[definition.kind]!;
        const text = description(definition);
        const related = members.related.map((entry) => built.get(entry));
        const descriptor = phRecord[builder](name, {
          ...(text !== undefined && { description: text }),
          ...(builder === "union"
            ? { members: related }
            : builder === "enum"
              ? {}
              : {
                  ...(related.length > 0 && { implements: related }),
                  fields: Object.fromEntries(members.fields),
                }),
          ...(builder === "enum" && { values: members.values }),
        });
        built.set(name, descriptor);
        return descriptor;
      },
      entry(entry) {
        const loose = builders as unknown as Readonly<
          Record<string, (...args: readonly unknown[]) => unknown>
        >;
        if (entry.kind === "resolve-type") {
          return loose.resolveType(built.get(entry.typeName), resolver);
        }
        if (entry.kind === "type") return loose.type(built.get(entry.typeName));
        if (entry.kind === "root") {
          return loose.root(entry.root, { description: entry.description });
        }
        if (entry.kind === "entity") {
          return loose.entity(built.get(entry.typeName), { key: entry.key });
        }
        const spec = {
          ...(entry.description !== undefined && {
            description: entry.description,
          }),
          ...(entry.deprecated !== undefined && {
            deprecated: entry.deprecated,
          }),
          ...(entry.args.length > 0 && {
            args: Object.fromEntries(entry.args),
          }),
          type: entry.type,
          ...(entry.kind === "subscription"
            ? {
                subscribe: resolver,
                ...(entry.hasResolve && { resolve: resolver }),
              }
            : { resolve: resolver }),
        };
        return entry.kind === "computed-field"
          ? loose.field(built.get(entry.typeName), entry.fieldName, spec)
          : loose[entry.kind](entry.fieldName, spec);
      },
    });
    compiled = compileSubgraph({
      name: subgraphName,
      entries: entries as Parameters<typeof compileSubgraph>[0]["entries"],
    });
  } catch (error) {
    if (error instanceof Refused) throw error;
    refuse(
      source.file,
      source.firstLine,
      `The SDL has no code-first form: ${error instanceof Error ? error.message : String(error)}`,
      "Change the SDL as the message says, or keep this subgraph schema-first.",
    );
  }
  const errors = compiled.diagnostics.filter(
    ({ severity }) => severity === "error",
  );
  if (compiled.definition === undefined || errors.length > 0) {
    refuse(
      source.file,
      source.firstLine,
      `The converted subgraph does not compile: ${errors.map(({ message }) => message).join(" ")}`,
      "Change the SDL as the message says, or keep this subgraph schema-first.",
    );
  }
  const converted = sortedSchemaText(
    projectSubgraphGraphQL(compiled.definition) as unknown as DocumentNode,
  );
  if (converted === sdl) return;
  const servedTypes = new Set(
    (
      projectSubgraphGraphQL(compiled.definition).definitions as readonly {
        readonly name?: { readonly value: string };
      }[]
    ).map((definition) => definition.name?.value),
  );
  const unreached = parse(source.text).definitions.find(
    (definition): definition is TypeDefinitionNode =>
      "name" in definition &&
      definition.name !== undefined &&
      !isRootName(definition.name.value) &&
      !BUILT_IN_SCALARS.has(definition.name.value) &&
      !servedTypes.has(definition.name.value),
  );
  if (unreached !== undefined) {
    refuse(
      source.file,
      sdlLine(source, unreached),
      `No query, mutation, subscription or computed field reaches ${unreached.name.value}, so a code-first subgraph would not serve it.`,
      `Return ${unreached.name.value} from a field, or remove it from the SDL.`,
    );
  }
  refuse(
    source.file,
    source.firstLine,
    `The converted subgraph would serve a different schema:\n${converted}`,
    "Keep this subgraph schema-first.",
  );
}
