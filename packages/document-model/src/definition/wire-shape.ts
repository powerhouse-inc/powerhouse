import type {
  DefinitionDiagnostic,
  DefinitionPath,
  DocumentModelDefinition,
  JsonValue,
} from "@powerhousedao/shared/document-model";
import { snapshotArray, snapshotRecord } from "./data-properties.js";
import type { DefinitionDiagnosticCollector } from "./diagnostics.js";
import { validateLocationFreeDocument } from "./graphql-ast.js";
import { canonicalJson, isGraphQLName } from "./primitives.js";
import { SCALAR_CATALOG_NAMES } from "./scalars/catalog.js";
import { scalarDefinitionIssues } from "./scalars/definition-shape.js";

/**
 * A runtime check of the closed V1 wire shape that
 * `@powerhousedao/shared/document-model` declares. Both adapters validate
 * their output with it, so a structured consumer can rely on the shape
 * regardless of which one produced the definition. Presence of
 * `kind` alone is not enough: every node is checked, including the
 * relationships between a specification's version, its state roots, and the
 * named types it declares.
 */

const BUILT_IN_SCALARS = ["ID", "String", "Boolean", "Int", "Float"] as const;
const SCALAR_NAMES: ReadonlySet<string> = new Set<string>([
  ...BUILT_IN_SCALARS,
  ...SCALAR_CATALOG_NAMES,
]);

type Record_ = { readonly [key: string]: unknown };

class ShapeChecker {
  readonly #collector: DefinitionDiagnosticCollector;
  /** The package scalars the specification being checked declares. */
  packageScalars: ReadonlySet<string> = new Set();

  constructor(collector: DefinitionDiagnosticCollector) {
    this.#collector = collector;
  }

  fail(
    path: DefinitionPath,
    message: string,
    expected: string,
    received: unknown,
  ): undefined {
    this.#collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path,
      message,
      expected,
      received:
        typeof received === "string"
          ? received
          : received === null
            ? "null"
            : typeof received === "number" || typeof received === "boolean"
              ? String(received)
              : Array.isArray(received)
                ? "an array"
                : typeof received,
      repair:
        "Produce the definition with the compiler or an adapter; a hand-edited wire definition is not accepted.",
    });
    return undefined;
  }

  record(
    value: unknown,
    keys: readonly string[],
    path: DefinitionPath,
  ): Record_ | undefined {
    const snapshot = snapshotRecord(value, keys, path);
    if (snapshot.ok) return snapshot.value;
    return this.fail(
      snapshot.path,
      `This node is not a plain object with the V1 members (${snapshot.reason}).`,
      keys.join(", "),
      value,
    );
  }

  array(value: unknown, path: DefinitionPath): readonly unknown[] | undefined {
    const snapshot = snapshotArray(value, path);
    if (snapshot.ok) return snapshot.value;
    return this.fail(
      snapshot.path,
      "This node must be an array.",
      "an array",
      value,
    );
  }

  string(value: unknown, path: DefinitionPath): string | undefined {
    if (typeof value === "string") return value;
    return this.fail(path, "This member must be a string.", "string", value);
  }

  nullableString(
    value: unknown,
    path: DefinitionPath,
  ): string | null | undefined {
    if (value === null || typeof value === "string") return value;
    return this.fail(
      path,
      "This member must be a string or null.",
      "string | null",
      value,
    );
  }

  literal<T extends string | number | boolean>(
    value: unknown,
    expected: T,
    path: DefinitionPath,
  ): T | undefined {
    if (value === expected) return expected;
    return this.fail(
      path,
      "This member has a fixed value.",
      String(expected),
      value,
    );
  }

  oneOf<T extends string>(
    value: unknown,
    allowed: readonly T[],
    path: DefinitionPath,
  ): T | undefined {
    if (
      typeof value === "string" &&
      (allowed as readonly string[]).includes(value)
    ) {
      return value as T;
    }
    return this.fail(
      path,
      "This member is outside its closed set.",
      allowed.join(" | "),
      value,
    );
  }

  positiveInteger(value: unknown, path: DefinitionPath): number | undefined {
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
      return value;
    }
    return this.fail(
      path,
      "This member must be a positive safe integer.",
      "a positive safe integer",
      value,
    );
  }

  json(value: unknown, path: DefinitionPath): JsonValue | undefined {
    try {
      canonicalJson(value);
    } catch (error) {
      return this.fail(
        path,
        `This member must be a JSON value: ${error instanceof Error ? error.message : String(error)}`,
        "a JSON value",
        value,
      );
    }
    return value as JsonValue;
  }

  graphQLName(value: unknown, path: DefinitionPath): string | undefined {
    if (isGraphQLName(value)) return value;
    return this.fail(
      path,
      "This member must be a GraphQL name.",
      "a GraphQL name",
      value,
    );
  }

  merge(diagnostics: readonly DefinitionDiagnostic[]): void {
    this.#collector.merge(diagnostics);
  }
}

function typeReference(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
): void {
  const kind = (value as Record_ | null)?.kind;
  if (kind === "list") {
    const node = check.record(value, ["kind", "required", "item"], path);
    if (node === undefined) return;
    if (typeof node.required !== "boolean") {
      check.fail(
        [...path, "required"],
        "A type reference records nullability.",
        "boolean",
        node.required,
      );
    }
    typeReference(check, node.item, [...path, "item"]);
    return;
  }
  const node = check.record(value, ["kind", "name", "required"], path);
  if (node === undefined) return;
  if (kind === "scalar") {
    const name = node.name as string;
    if (!SCALAR_NAMES.has(name) && !check.packageScalars.has(name)) {
      check.fail(
        [...path, "name"],
        "A scalar reference must name a catalog scalar, a GraphQL built-in, or a package scalar the specification declares.",
        [...SCALAR_NAMES, ...check.packageScalars].join(" | "),
        node.name,
      );
    }
  } else if (kind === "named") {
    check.graphQLName(node.name, [...path, "name"]);
  } else {
    check.fail(
      [...path, "kind"],
      "A type reference has three kinds.",
      "scalar | named | list",
      kind,
    );
  }
  if (typeof node.required !== "boolean") {
    check.fail(
      [...path, "required"],
      "A type reference records nullability.",
      "boolean",
      node.required,
    );
  }
}

function directiveUses(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
): void {
  const uses = check.array(value, path);
  if (uses === undefined) return;
  uses.forEach((use, index) => {
    const node = check.record(use, ["name", "arguments"], [...path, index]);
    if (node === undefined) return;
    check.graphQLName(node.name, [...path, index, "name"]);
    const args = check.array(node.arguments, [...path, index, "arguments"]);
    args?.forEach((argument, argumentIndex) => {
      const argumentPath = [...path, index, "arguments", argumentIndex];
      const entry = check.record(argument, ["name", "value"], argumentPath);
      if (entry === undefined) return;
      check.graphQLName(entry.name, [...argumentPath, "name"]);
      check.json(entry.value, [...argumentPath, "value"]);
    });
  });
}

function field(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
  options: { readonly input: boolean },
): void {
  const keys = options.input
    ? [
        "key",
        "name",
        "description",
        "deprecated",
        "type",
        "directives",
        "defaultValue",
      ]
    : [
        "key",
        "name",
        "description",
        "deprecated",
        "args",
        "type",
        "directives",
      ];
  const node = check.record(value, keys, path);
  if (node === undefined) return;
  check.string(node.key, [...path, "key"]);
  check.graphQLName(node.name, [...path, "name"]);
  check.nullableString(node.description, [...path, "description"]);
  check.nullableString(node.deprecated, [...path, "deprecated"]);
  typeReference(check, node.type, [...path, "type"]);
  if (node.directives !== undefined) {
    directiveUses(check, node.directives, [...path, "directives"]);
  }
  if (options.input) {
    if (Object.hasOwn(node, "defaultValue")) {
      check.json(node.defaultValue, [...path, "defaultValue"]);
    }
    return;
  }
  if (node.args !== undefined) {
    const args = check.array(node.args, [...path, "args"]);
    args?.forEach((argument, index) =>
      field(check, argument, [...path, "args", index], { input: true }),
    );
  }
}

function namedType(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
): string | undefined {
  const kind = (value as Record_ | null)?.kind;
  switch (kind) {
    case "enum": {
      const node = check.record(
        value,
        ["kind", "name", "description", "values"],
        path,
      );
      if (node === undefined) return undefined;
      const values = check.array(node.values, [...path, "values"]);
      values?.forEach((entry, index) => {
        const valuePath = [...path, "values", index];
        const enumValue = check.record(
          entry,
          ["name", "description", "deprecated", "directives"],
          valuePath,
        );
        if (enumValue === undefined) return;
        check.graphQLName(enumValue.name, [...valuePath, "name"]);
        check.nullableString(enumValue.description, [
          ...valuePath,
          "description",
        ]);
        check.nullableString(enumValue.deprecated, [
          ...valuePath,
          "deprecated",
        ]);
        if (enumValue.directives !== undefined) {
          directiveUses(check, enumValue.directives, [
            ...valuePath,
            "directives",
          ]);
        }
      });
      return check.graphQLName(node.name, [...path, "name"]);
    }
    case "object":
    case "interface": {
      const node = check.record(
        value,
        ["kind", "name", "description", "implements", "fields"],
        path,
      );
      if (node === undefined) return undefined;
      if (node.implements !== undefined) {
        const implemented = check.array(node.implements, [
          ...path,
          "implements",
        ]);
        implemented?.forEach((entry, index) =>
          check.graphQLName(entry, [...path, "implements", index]),
        );
      }
      const fields = check.array(node.fields, [...path, "fields"]);
      fields?.forEach((entry, index) =>
        field(check, entry, [...path, "fields", index], { input: false }),
      );
      return check.graphQLName(node.name, [...path, "name"]);
    }
    case "input": {
      const node = check.record(
        value,
        ["kind", "name", "description", "unknownKeys", "fields"],
        path,
      );
      if (node === undefined) return undefined;
      check.oneOf(
        node.unknownKeys,
        ["preserve", "reject"],
        [...path, "unknownKeys"],
      );
      const fields = check.array(node.fields, [...path, "fields"]);
      fields?.forEach((entry, index) =>
        field(check, entry, [...path, "fields", index], { input: true }),
      );
      return check.graphQLName(node.name, [...path, "name"]);
    }
    case "union": {
      const node = check.record(
        value,
        ["kind", "name", "description", "members"],
        path,
      );
      if (node === undefined) return undefined;
      const members = check.array(node.members, [...path, "members"]);
      members?.forEach((member, index) =>
        check.graphQLName(member, [...path, "members", index]),
      );
      return check.graphQLName(node.name, [...path, "name"]);
    }
    default:
      check.fail(
        [...path, "kind"],
        "A named type has five kinds.",
        "enum | object | interface | input | union",
        kind,
      );
      return undefined;
  }
}

function example(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
  keys: readonly string[],
): void {
  const node = check.record(value, keys, path);
  if (node === undefined) return;
  for (const key of keys) check.string(node[key], [...path, key]);
}

function state(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
  options: { readonly scope: "global" | "local" },
): void {
  const node = check.record(
    value,
    ["root", "initialValue", "examples", "unknownKeys", "materialized"],
    path,
  );
  if (node === undefined) return;
  if (node.root === null) {
    if (options.scope === "global") {
      check.fail(
        [...path, "root"],
        "A global state always has a root.",
        "a named type reference",
        null,
      );
    }
    if (canonicalJson(node.initialValue ?? null) !== "{}") {
      check.fail(
        [...path, "initialValue"],
        "An empty local state carries an exact empty object.",
        "{}",
        node.initialValue,
      );
    }
  } else {
    typeReference(check, node.root, [...path, "root"]);
    check.json(node.initialValue, [...path, "initialValue"]);
  }
  check.literal(node.unknownKeys, "preserve", [...path, "unknownKeys"]);
  const examples = check.array(node.examples, [...path, "examples"]);
  examples?.forEach((entry, index) =>
    example(check, entry, [...path, "examples", index], ["id", "key", "value"]),
  );
  const materialized = check.record(
    node.materialized,
    ["schema", "initialValue", "examples"],
    [...path, "materialized"],
  );
  if (materialized === undefined) return;
  const schema = check.string(materialized.schema, [
    ...path,
    "materialized",
    "schema",
  ]);
  if (node.root === null && schema !== undefined && schema !== "") {
    check.fail(
      [...path, "materialized", "schema"],
      "An empty local state materializes an empty schema.",
      '""',
      schema,
    );
  }
  check.string(materialized.initialValue, [
    ...path,
    "materialized",
    "initialValue",
  ]);
  const materializedExamples = check.array(materialized.examples, [
    ...path,
    "materialized",
    "examples",
  ]);
  materializedExamples?.forEach((entry, index) =>
    example(
      check,
      entry,
      [...path, "materialized", "examples", index],
      ["id", "value"],
    ),
  );
}

function operation(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
): void {
  const node = check.record(
    value,
    [
      "id",
      "key",
      "name",
      "description",
      "actionType",
      "creatorKey",
      "scope",
      "input",
      "errors",
      "examples",
      "template",
      "reducer",
    ],
    path,
  );
  if (node === undefined) return;
  check.string(node.id, [...path, "id"]);
  check.string(node.key, [...path, "key"]);
  check.nullableString(node.name, [...path, "name"]);
  check.nullableString(node.description, [...path, "description"]);
  check.string(node.actionType, [...path, "actionType"]);
  check.string(node.creatorKey, [...path, "creatorKey"]);
  check.oneOf(node.scope, ["global", "local"], [...path, "scope"]);
  check.nullableString(node.template, [...path, "template"]);
  check.nullableString(node.reducer, [...path, "reducer"]);
  if (node.input !== null) {
    const input = namedType(check, node.input, [...path, "input"]);
    if (input !== undefined && (node.input as Record_).kind !== "input") {
      check.fail(
        [...path, "input", "kind"],
        "An operation input is an input type.",
        "input",
        (node.input as Record_).kind,
      );
    }
  }
  const errors = check.array(node.errors, [...path, "errors"]);
  errors?.forEach((entry, index) => {
    const errorPath = [...path, "errors", index];
    const error = check.record(
      entry,
      ["id", "key", "code", "name", "description", "template"],
      errorPath,
    );
    if (error === undefined) return;
    check.string(error.id, [...errorPath, "id"]);
    check.string(error.key, [...errorPath, "key"]);
    for (const key of ["code", "name", "description", "template"] as const) {
      check.nullableString(error[key], [...errorPath, key]);
    }
  });
  const examples = check.array(node.examples, [...path, "examples"]);
  examples?.forEach((entry, index) =>
    example(check, entry, [...path, "examples", index], ["id", "key", "value"]),
  );
}

function specification(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
): void {
  const node = check.record(
    value,
    [
      "version",
      "scalars",
      "graphQLCompatibility",
      "types",
      "state",
      "modules",
      "changeLog",
    ],
    path,
  );
  if (node === undefined) return;
  check.positiveInteger(node.version, [...path, "version"]);

  const packageScalars = new Set<string>();
  const scalars = check.array(node.scalars, [...path, "scalars"]);
  scalars?.forEach((entry, index) => {
    const scalarPath = [...path, "scalars", index];
    const declared =
      typeof entry === "object" &&
      entry !== null &&
      Object.hasOwn(entry, "definition");
    const scalar = check.record(
      entry,
      declared
        ? ["name", "implementation", "coercionProfile", "definition"]
        : ["name", "implementation", "coercionProfile"],
      scalarPath,
    );
    if (scalar === undefined) return;
    check.literal(scalar.coercionProfile, "document-engineering-1.40", [
      ...scalarPath,
      "coercionProfile",
    ]);
    if (!declared) {
      const name = check.oneOf(scalar.name, SCALAR_CATALOG_NAMES, [
        ...scalarPath,
        "name",
      ]);
      if (name !== undefined) {
        check.literal(scalar.implementation, `powerhouse.catalog#${name}`, [
          ...scalarPath,
          "implementation",
        ]);
      }
      return;
    }
    const name = check.graphQLName(scalar.name, [...scalarPath, "name"]);
    if (name === undefined) return;
    if (SCALAR_NAMES.has(name) || packageScalars.has(name)) {
      check.fail(
        [...scalarPath, "name"],
        "A package scalar has a name no catalog scalar, GraphQL built-in, or other package scalar uses.",
        "an unused GraphQL name",
        name,
      );
      return;
    }
    check.literal(scalar.implementation, `package#${name}`, [
      ...scalarPath,
      "implementation",
    ]);
    for (const issue of scalarDefinitionIssues(scalar.definition, name, [
      ...scalarPath,
      "definition",
    ])) {
      check.fail(
        issue.path,
        issue.message,
        "the definition defineScalar emits",
        issue.received,
      );
    }
    packageScalars.add(name);
  });
  check.packageScalars = packageScalars;

  if (node.graphQLCompatibility !== null) {
    const compatibilityPath = [...path, "graphQLCompatibility"];
    const compatibility = check.record(
      node.graphQLCompatibility,
      ["kind", "document", "preserveDefinitionOrder"],
      compatibilityPath,
    );
    if (compatibility !== undefined) {
      check.literal(compatibility.kind, "graphql-ast-v1", [
        ...compatibilityPath,
        "kind",
      ]);
      check.literal(compatibility.preserveDefinitionOrder, true, [
        ...compatibilityPath,
        "preserveDefinitionOrder",
      ]);
      check.merge(
        validateLocationFreeDocument(compatibility.document, [
          ...compatibilityPath,
          "document",
        ]),
      );
    }
  }

  const declared = new Set<string>();
  const types = check.array(node.types, [...path, "types"]);
  types?.forEach((entry, index) => {
    const name = namedType(check, entry, [...path, "types", index]);
    if (name === undefined) return;
    if (declared.has(name) || packageScalars.has(name)) {
      check.fail(
        [...path, "types", index, "name"],
        "A named type is declared once per specification, and never under a package scalar's name.",
        "one definition per name",
        name,
      );
    }
    declared.add(name);
  });

  const stateNode = check.record(
    node.state,
    ["global", "local"],
    [...path, "state"],
  );
  if (stateNode !== undefined) {
    state(check, stateNode.global, [...path, "state", "global"], {
      scope: "global",
    });
    state(check, stateNode.local, [...path, "state", "local"], {
      scope: "local",
    });
    // The roots are type references into this specification's own inventory.
    for (const scope of ["global", "local"] as const) {
      const root = (stateNode[scope] as Record_ | undefined)?.root as
        | Record_
        | null
        | undefined;
      const name = root?.name;
      if (typeof name === "string" && !declared.has(name)) {
        check.fail(
          [...path, "state", scope, "root", "name"],
          "A state root must be declared in this specification's types.",
          [...declared].join(" | "),
          name,
        );
      }
    }
  }

  const modules = check.array(node.modules, [...path, "modules"]);
  modules?.forEach((entry, index) => {
    const modulePath = [...path, "modules", index];
    const module = check.record(
      entry,
      ["id", "key", "name", "description", "operations"],
      modulePath,
    );
    if (module === undefined) return;
    check.string(module.id, [...modulePath, "id"]);
    check.string(module.key, [...modulePath, "key"]);
    check.nullableString(module.name, [...modulePath, "name"]);
    check.nullableString(module.description, [...modulePath, "description"]);
    const operations = check.array(module.operations, [
      ...modulePath,
      "operations",
    ]);
    operations?.forEach((candidate, operationIndex) =>
      operation(check, candidate, [
        ...modulePath,
        "operations",
        operationIndex,
      ]),
    );
  });

  const changeLog = check.array(node.changeLog, [...path, "changeLog"]);
  changeLog?.forEach((entry, index) =>
    check.string(entry, [...path, "changeLog", index]),
  );
}

/**
 * Checks one value against the closed V1 wire shape and reports what is wrong
 * instead of throwing, so one malformed export cannot lose the reports of the
 * roots beside it.
 */
export function checkDocumentModelDefinitionShape(
  collector: DefinitionDiagnosticCollector,
  value: unknown,
  path: DefinitionPath = [],
): value is DocumentModelDefinition {
  const before = collector.size;
  const check = new ShapeChecker(collector);
  const node = check.record(
    value,
    ["kind", "formatVersion", "compatibility", "model", "specifications"],
    path,
  );
  if (node === undefined) return false;
  check.literal(node.kind, "powerhouse.document-model", [...path, "kind"]);
  check.literal(node.formatVersion, 1, [...path, "formatVersion"]);

  const compatibility = check.record(
    node.compatibility,
    ["identity", "scalarCoercion", "serialization"],
    [...path, "compatibility"],
  );
  if (compatibility !== undefined) {
    check.oneOf(
      compatibility.identity,
      ["derived-v1", "explicit-schema-first"],
      [...path, "compatibility", "identity"],
    );
    check.literal(compatibility.scalarCoercion, "document-engineering-1.40", [
      ...path,
      "compatibility",
      "scalarCoercion",
    ]);
    check.oneOf(
      compatibility.serialization,
      ["canonical-v1", "explicit-schema-first"],
      [...path, "compatibility", "serialization"],
    );
  }

  const model = check.record(
    node.model,
    [
      "documentType",
      "graphQLName",
      "name",
      "description",
      "extension",
      "author",
    ],
    [...path, "model"],
  );
  if (model !== undefined) {
    const documentType = check.string(model.documentType, [
      ...path,
      "model",
      "documentType",
    ]);
    if (documentType === "") {
      check.fail(
        [...path, "model", "documentType"],
        "A document type is not empty.",
        "a document type",
        "",
      );
    }
    check.graphQLName(model.graphQLName, [...path, "model", "graphQLName"]);
    check.string(model.name, [...path, "model", "name"]);
    check.string(model.description, [...path, "model", "description"]);
    check.string(model.extension, [...path, "model", "extension"]);
    const author = check.record(
      model.author,
      ["name", "website"],
      [...path, "model", "author"],
    );
    if (author !== undefined) {
      check.string(author.name, [...path, "model", "author", "name"]);
      check.nullableString(author.website, [
        ...path,
        "model",
        "author",
        "website",
      ]);
    }
  }

  const specifications = check.array(node.specifications, [
    ...path,
    "specifications",
  ]);
  if (specifications !== undefined) {
    if (specifications.length === 0) {
      check.fail(
        [...path, "specifications"],
        "A definition carries at least one specification.",
        "a nonempty specification history",
        "an empty array",
      );
    }
    specifications.forEach((entry, index) =>
      specification(check, entry, [...path, "specifications", index]),
    );
  }
  return collector.size === before;
}
