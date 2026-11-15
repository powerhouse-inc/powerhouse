import type {
  DefinitionDiagnostic,
  DefinitionPath,
  JsonValue,
} from "@powerhousedao/shared/document-model";
import { parseInitialAuthTemplate } from "@powerhousedao/shared/document-model";
import type { DocumentModelDefinition } from "@powerhousedao/shared/document-model";
import { validateInitialAuthSpecification } from "../auth/wire.js";
import { documentModelScalars, scalarCatalog } from "../../scalars/catalog.js";
import { DefinitionDiagnosticCollector } from "../kernel/diagnostic-collector.js";
import {
  rejectionReceived,
  snapshotArray,
  snapshotRecord,
} from "../kernel/data-properties.js";
import { describeReceived } from "../kernel/diagnostics.js";
import { validateLocationFreeDocument } from "../kernel/graphql-ast.js";
import { canonicalJson, isGraphQLName } from "../kernel/primitives.js";
import {
  type CompilerDiagnosticCode,
  compilerDiagnostics,
} from "./diagnostic-codes.js";

type Node = { readonly [key: string]: unknown };

const BUILT_IN_SCALARS = ["ID", "String", "Boolean", "Int", "Float"] as const;
const CATALOG_SCALARS = documentModelScalars.map(({ name }) => name);
const MODEL_SCALARS: ReadonlySet<string> = new Set([
  ...BUILT_IN_SCALARS,
  ...CATALOG_SCALARS,
]);
const HOST_ONLY_SCALARS: ReadonlySet<string> = new Set(
  scalarCatalog
    .map(({ name }) => name)
    .filter((name) => !MODEL_SCALARS.has(name)),
);
const SCALAR_REPRESENTATIONS = [
  "string",
  "number",
  "boolean",
  "json-object",
  "json",
  "opaque",
] as const;

class ShapeChecker {
  readonly collector =
    new DefinitionDiagnosticCollector<CompilerDiagnosticCode>(
      compilerDiagnostics,
    );

  packageScalars: ReadonlySet<string> = new Set();

  fail(
    path: DefinitionPath,
    message: string,
    expected: string,
    received: unknown,
  ): undefined {
    this.collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path,
      message,
      expected,
      received:
        typeof received === "string"
          ? received
          : typeof received === "number" || typeof received === "boolean"
            ? String(received)
            : describeReceived(received),
      repair:
        "Produce the definition with materialize or a document-model/tooling adapter; a hand-edited wire definition is not accepted.",
    });
    return undefined;
  }

  record(
    value: unknown,
    keys: readonly string[],
    path: DefinitionPath,
  ): Node | undefined {
    const snapshot = snapshotRecord(value, keys, path);
    if (snapshot.ok) return snapshot.value;
    return this.fail(
      snapshot.path,
      `This node is not a plain object with the V1 members (${snapshot.reason}).`,
      keys.join(", "),
      rejectionReceived(snapshot),
    );
  }

  array(value: unknown, path: DefinitionPath): readonly unknown[] | undefined {
    const snapshot = snapshotArray(value, path);
    if (snapshot.ok) return snapshot.value;
    return this.fail(
      snapshot.path,
      "This node must be an array.",
      "an array",
      rejectionReceived(snapshot),
    );
  }

  string(value: unknown, path: DefinitionPath): string | undefined {
    if (typeof value === "string") return value;
    return this.fail(path, "This member must be a string.", "string", value);
  }

  nullableString(value: unknown, path: DefinitionPath): void {
    if (value === null || typeof value === "string") return;
    this.fail(
      path,
      "This member must be a string or null.",
      "string | null",
      value,
    );
  }

  literal(
    value: unknown,
    expected: string | number | boolean,
    path: DefinitionPath,
  ): void {
    if (value === expected) return;
    this.fail(path, "This member has a fixed value.", String(expected), value);
  }

  oneOf<T extends string>(
    value: unknown,
    allowed: readonly T[],
    path: DefinitionPath,
  ): T | undefined {
    if ((allowed as readonly unknown[]).includes(value)) return value as T;
    return this.fail(
      path,
      "This member is outside its closed set.",
      allowed.join(" | "),
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

  rejectHostOnlyScalar(value: unknown, path: DefinitionPath): boolean {
    if (typeof value !== "string" || !HOST_ONLY_SCALARS.has(value)) {
      return false;
    }
    this.collector.add({
      code: "PH-SCALAR-INTERNAL",
      definition: { kind: "scalar", key: value },
      path,
      message: `${value} is internal to the reactor host. A document model cannot use it.`,
      received: value,
      repair:
        "Use ph.Unknown() for an unconstrained value, or ph.object(...) for a structured one.",
    });
    return true;
  }
}

function typeReference(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
): void {
  const kind = (value as Node | null)?.kind;
  const node =
    kind === "list"
      ? check.record(value, ["kind", "required", "item"], path)
      : check.record(value, ["kind", "name", "required"], path);
  if (node === undefined) return;
  if (typeof node.required !== "boolean") {
    check.fail(
      [...path, "required"],
      "A type reference records nullability.",
      "boolean",
      node.required,
    );
  }
  if (kind === "list") {
    typeReference(check, node.item, [...path, "item"]);
  } else if (kind === "scalar") {
    if (check.rejectHostOnlyScalar(node.name, [...path, "name"])) return;
    if (
      typeof node.name !== "string" ||
      !(MODEL_SCALARS.has(node.name) || check.packageScalars.has(node.name))
    ) {
      check.fail(
        [...path, "name"],
        "A scalar reference names a catalog scalar, a GraphQL built-in, or a package scalar the specification declares.",
        [...MODEL_SCALARS, ...check.packageScalars].join(" | "),
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
}

function directiveUses(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
): void {
  check.array(value, path)?.forEach((use, index) => {
    const node = check.record(use, ["name", "arguments"], [...path, index]);
    if (node === undefined) return;
    check.graphQLName(node.name, [...path, index, "name"]);
    const args = check.array(node.arguments, [...path, index, "arguments"]);
    args?.forEach((argument, argumentIndex) => {
      const at = [...path, index, "arguments", argumentIndex];
      const entry = check.record(argument, ["name", "value"], at);
      if (entry === undefined) return;
      check.graphQLName(entry.name, [...at, "name"]);
      check.json(entry.value, [...at, "value"]);
    });
  });
}

const FIELD_KEYS = ["key", "name", "description", "deprecated", "type"];

function field(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
  input: boolean,
): void {
  const node = check.record(
    value,
    [...FIELD_KEYS, "directives", input ? "defaultValue" : "args"],
    path,
  );
  if (node === undefined) return;
  check.string(node.key, [...path, "key"]);
  check.graphQLName(node.name, [...path, "name"]);
  check.nullableString(node.description, [...path, "description"]);
  check.nullableString(node.deprecated, [...path, "deprecated"]);
  typeReference(check, node.type, [...path, "type"]);
  if (node.directives !== undefined) {
    directiveUses(check, node.directives, [...path, "directives"]);
  }
  if (input) {
    if (Object.hasOwn(node, "defaultValue")) {
      check.json(node.defaultValue, [...path, "defaultValue"]);
    }
  } else if (node.args !== undefined) {
    check
      .array(node.args, [...path, "args"])
      ?.forEach((argument, index) =>
        field(check, argument, [...path, "args", index], true),
      );
  }
}

function fields(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
  input: boolean,
): void {
  check
    .array(value, path)
    ?.forEach((entry, index) => field(check, entry, [...path, index], input));
}

function enumValue(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
): void {
  const node = check.record(
    value,
    ["name", "description", "deprecated", "directives"],
    path,
  );
  if (node === undefined) return;
  check.graphQLName(node.name, [...path, "name"]);
  check.nullableString(node.description, [...path, "description"]);
  check.nullableString(node.deprecated, [...path, "deprecated"]);
  if (node.directives !== undefined) {
    directiveUses(check, node.directives, [...path, "directives"]);
  }
}

const NAMED_TYPE_MEMBERS = {
  enum: "values",
  object: "fields",
  interface: "fields",
  input: "fields",
  union: "members",
} as const;

function namedType(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
): string | undefined {
  const kind = (value as Node | null)?.kind;
  if (typeof kind !== "string" || !Object.hasOwn(NAMED_TYPE_MEMBERS, kind)) {
    return check.fail(
      [...path, "kind"],
      "A named type has five kinds.",
      Object.keys(NAMED_TYPE_MEMBERS).join(" | "),
      kind,
    );
  }
  const typed = kind as keyof typeof NAMED_TYPE_MEMBERS;
  const member = NAMED_TYPE_MEMBERS[typed];
  const extra =
    typed === "object" || typed === "interface"
      ? ["implements"]
      : typed === "input"
        ? ["unknownKeys"]
        : [];
  const node = check.record(
    value,
    ["kind", "name", "description", ...extra, member],
    path,
  );
  if (node === undefined) return undefined;
  check.nullableString(node.description, [...path, "description"]);
  const members = check.array(node[member], [...path, member]);
  switch (typed) {
    case "enum":
      members?.forEach((entry, index) =>
        enumValue(check, entry, [...path, "values", index]),
      );
      break;
    case "union":
      members?.forEach((entry, index) =>
        check.graphQLName(entry, [...path, "members", index]),
      );
      break;
    case "input":
      check.oneOf(
        node.unknownKeys,
        ["preserve", "reject"],
        [...path, "unknownKeys"],
      );
      fields(check, node.fields, [...path, "fields"], true);
      break;
    default:
      if (node.implements !== undefined) {
        check
          .array(node.implements, [...path, "implements"])
          ?.forEach((entry, index) =>
            check.graphQLName(entry, [...path, "implements", index]),
          );
      }
      fields(check, node.fields, [...path, "fields"], false);
  }
  return check.graphQLName(node.name, [...path, "name"]);
}

function examples(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
  keys: readonly string[],
): void {
  check.array(value, path)?.forEach((entry, index) => {
    const node = check.record(entry, keys, [...path, index]);
    if (node === undefined) return;
    for (const key of keys) check.string(node[key], [...path, index, key]);
  });
}

function state(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
  scope: "global" | "local",
): void {
  const node = check.record(
    value,
    ["root", "initialValue", "examples", "unknownKeys", "materialized"],
    path,
  );
  if (node === undefined) return;
  if (node.root === null) {
    if (scope === "global") {
      check.fail(
        [...path, "root"],
        "A global state always has a root.",
        "a named type reference",
        null,
      );
    }
    if (
      check.json(node.initialValue, [...path, "initialValue"]) !== undefined
    ) {
      if (canonicalJson(node.initialValue) !== "{}") {
        check.fail(
          [...path, "initialValue"],
          "An empty local state carries an exact empty object.",
          "{}",
          node.initialValue,
        );
      }
    }
  } else {
    typeReference(check, node.root, [...path, "root"]);
    check.json(node.initialValue, [...path, "initialValue"]);
  }
  check.literal(node.unknownKeys, "preserve", [...path, "unknownKeys"]);
  examples(check, node.examples, [...path, "examples"], ["id", "key", "value"]);
  const materializedPath = [...path, "materialized"];
  const materialized = check.record(
    node.materialized,
    ["schema", "initialValue", "examples"],
    materializedPath,
  );
  if (materialized === undefined) return;
  const schema = check.string(materialized.schema, [
    ...materializedPath,
    "schema",
  ]);
  if (node.root === null && schema !== undefined && schema !== "") {
    check.fail(
      [...materializedPath, "schema"],
      "An empty local state materializes an empty schema.",
      '""',
      schema,
    );
  }
  check.string(materialized.initialValue, [
    ...materializedPath,
    "initialValue",
  ]);
  examples(
    check,
    materialized.examples,
    [...materializedPath, "examples"],
    ["id", "value"],
  );
}

const OPERATION_KEYS = [
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
];
const ERROR_KEYS = ["id", "key", "code", "name", "description", "template"];

function operation(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
): void {
  const node = check.record(value, OPERATION_KEYS, path);
  if (node === undefined) return;
  for (const key of ["id", "key", "actionType", "creatorKey"]) {
    check.string(node[key], [...path, key]);
  }
  for (const key of ["name", "description", "template", "reducer"]) {
    check.nullableString(node[key], [...path, key]);
  }
  check.oneOf(node.scope, ["global", "local"], [...path, "scope"]);
  if (node.input !== null) {
    const kind = (node.input as Node | null)?.kind;
    if (kind !== "input") {
      check.fail(
        [...path, "input", "kind"],
        "An operation input is an input type.",
        "input",
        kind,
      );
    } else {
      namedType(check, node.input, [...path, "input"]);
    }
  }
  check.array(node.errors, [...path, "errors"])?.forEach((entry, index) => {
    const at = [...path, "errors", index];
    const error = check.record(entry, ERROR_KEYS, at);
    if (error === undefined) return;
    check.string(error.id, [...at, "id"]);
    check.string(error.key, [...at, "key"]);
    for (const key of ["code", "name", "description", "template"]) {
      check.nullableString(error[key], [...at, key]);
    }
  });
  examples(check, node.examples, [...path, "examples"], ["id", "key", "value"]);
}

function storedScalar(
  check: ShapeChecker,
  value: unknown,
  name: string,
  path: DefinitionPath,
): void {
  const node = check.record(
    value,
    [
      "kind",
      "formatVersion",
      "name",
      "representation",
      "description",
      "coercion",
      "coercionProfile",
    ],
    path,
  );
  if (node === undefined) return;
  check.literal(node.kind, "powerhouse.scalar", [...path, "kind"]);
  check.literal(node.formatVersion, 1, [...path, "formatVersion"]);
  check.literal(node.name, name, [...path, "name"]);
  check.oneOf(node.representation, SCALAR_REPRESENTATIONS, [
    ...path,
    "representation",
  ]);
  check.string(node.description, [...path, "description"]);
  check.literal(node.coercionProfile, "catalog-v1", [
    ...path,
    "coercionProfile",
  ]);
  const coercion = check.record(
    node.coercion,
    ["source"],
    [...path, "coercion"],
  );
  if (coercion !== undefined) {
    check.oneOf(
      coercion.source,
      ["derived", "explicit"],
      [...path, "coercion", "source"],
    );
  }
}

function scalars(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
): ReadonlySet<string> {
  const declared = new Set<string>();
  check.array(value, path)?.forEach((entry, index) => {
    const at = [...path, index];
    const isPackage =
      typeof entry === "object" &&
      entry !== null &&
      Object.hasOwn(entry, "definition");
    const scalar = check.record(
      entry,
      ["name", "implementation", "coercionProfile", "definition"],
      at,
    );
    if (scalar === undefined) return;
    check.literal(scalar.coercionProfile, "catalog-v1", [
      ...at,
      "coercionProfile",
    ]);
    if (check.rejectHostOnlyScalar(scalar.name, [...at, "name"])) return;
    if (!isPackage) {
      const name = check.oneOf(scalar.name, CATALOG_SCALARS, [...at, "name"]);
      if (name !== undefined) {
        check.literal(scalar.implementation, `powerhouse.catalog#${name}`, [
          ...at,
          "implementation",
        ]);
      }
      return;
    }
    const name = check.graphQLName(scalar.name, [...at, "name"]);
    if (name === undefined) return;
    if (MODEL_SCALARS.has(name) || declared.has(name)) {
      check.fail(
        [...at, "name"],
        "A package scalar has a name no catalog scalar, GraphQL built-in, or other package scalar uses.",
        "an unused GraphQL name",
        name,
      );
      return;
    }
    check.literal(scalar.implementation, `package#${name}`, [
      ...at,
      "implementation",
    ]);
    storedScalar(check, scalar.definition, name, [...at, "definition"]);
    declared.add(name);
  });
  return declared;
}

function specification(
  check: ShapeChecker,
  value: unknown,
  path: DefinitionPath,
  formatVersion: unknown,
  documentType: string,
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
      ...(formatVersion === 2 ? ["initialAuth"] : []),
    ],
    path,
  );
  if (node === undefined) return;
  if (node.initialAuth !== undefined) {
    try {
      parseInitialAuthTemplate(node.initialAuth, documentType);
    } catch (error) {
      check.fail(
        [...path, "initialAuth"],
        error instanceof Error
          ? error.message
          : "Invalid initial authorization template.",
        "a valid initial authorization template",
        node.initialAuth,
      );
    }
  }
  if (
    typeof node.version !== "number" ||
    !Number.isSafeInteger(node.version) ||
    node.version <= 0
  ) {
    check.fail(
      [...path, "version"],
      "A specification version is a positive safe integer.",
      "a positive safe integer",
      node.version,
    );
  }
  check.packageScalars = scalars(check, node.scalars, [...path, "scalars"]);

  if (node.graphQLCompatibility !== null) {
    const at = [...path, "graphQLCompatibility"];
    const compatibility = check.record(
      node.graphQLCompatibility,
      ["kind", "document", "preserveDefinitionOrder"],
      at,
    );
    if (compatibility !== undefined) {
      check.literal(compatibility.kind, "graphql-ast-v1", [...at, "kind"]);
      check.literal(compatibility.preserveDefinitionOrder, true, [
        ...at,
        "preserveDefinitionOrder",
      ]);
      check.collector.merge(
        validateLocationFreeDocument(compatibility.document, [
          ...at,
          "document",
        ]),
      );
    }
  }

  const declared = new Set<string>();
  check.array(node.types, [...path, "types"])?.forEach((entry, index) => {
    const name = namedType(check, entry, [...path, "types", index]);
    if (name === undefined) return;
    if (declared.has(name) || check.packageScalars.has(name)) {
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
    for (const scope of ["global", "local"] as const) {
      state(check, stateNode[scope], [...path, "state", scope], scope);
      const root = (stateNode[scope] as Node | undefined)?.root as
        | Node
        | null
        | undefined;
      if (typeof root?.name === "string" && !declared.has(root.name)) {
        check.fail(
          [...path, "state", scope, "root", "name"],
          "A state root is declared in this specification's types.",
          [...declared].join(" | "),
          root.name,
        );
      }
    }
  }

  check.array(node.modules, [...path, "modules"])?.forEach((entry, index) => {
    const at = [...path, "modules", index];
    const module = check.record(
      entry,
      ["id", "key", "name", "description", "operations"],
      at,
    );
    if (module === undefined) return;
    check.string(module.id, [...at, "id"]);
    check.string(module.key, [...at, "key"]);
    check.string(module.name, [...at, "name"]);
    check.nullableString(module.description, [...at, "description"]);
    check
      .array(module.operations, [...at, "operations"])
      ?.forEach((candidate, operationIndex) =>
        operation(check, candidate, [...at, "operations", operationIndex]),
      );
  });

  check
    .array(node.changeLog, [...path, "changeLog"])
    ?.forEach((entry, index) =>
      check.string(entry, [...path, "changeLog", index]),
    );
}

export function checkDocumentModelDefinitionShape(
  value: unknown,
  path: DefinitionPath = [],
): readonly DefinitionDiagnostic[] {
  const check = new ShapeChecker();
  const node = check.record(
    value,
    ["kind", "formatVersion", "compatibility", "model", "specifications"],
    path,
  );
  if (node === undefined) return check.collector.diagnostics;
  check.literal(node.kind, "powerhouse.document-model", [...path, "kind"]);
  if (node.formatVersion !== 1 && node.formatVersion !== 2)
    check.fail(
      [...path, "formatVersion"],
      "Unsupported document-model definition format.",
      "1 | 2",
      node.formatVersion,
    );

  const compatibilityPath = [...path, "compatibility"];
  const compatibility = check.record(
    node.compatibility,
    ["identity", "scalarCoercion", "serialization"],
    compatibilityPath,
  );
  if (compatibility !== undefined) {
    check.oneOf(
      compatibility.identity,
      ["derived-v1", "explicit-schema-first"],
      [...compatibilityPath, "identity"],
    );
    check.literal(compatibility.scalarCoercion, "catalog-v1", [
      ...compatibilityPath,
      "scalarCoercion",
    ]);
    check.oneOf(
      compatibility.serialization,
      ["canonical-v1", "explicit-schema-first"],
      [...compatibilityPath, "serialization"],
    );
  }

  const modelPath = [...path, "model"];
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
    modelPath,
  );
  if (model !== undefined) {
    if (
      check.string(model.documentType, [...modelPath, "documentType"]) === ""
    ) {
      check.fail(
        [...modelPath, "documentType"],
        "A document type is not empty.",
        "a document type",
        '""',
      );
    }
    check.graphQLName(model.graphQLName, [...modelPath, "graphQLName"]);
    for (const key of ["name", "description", "extension"]) {
      check.string(model[key], [...modelPath, key]);
    }
    const author = check.record(
      model.author,
      ["name", "website"],
      [...modelPath, "author"],
    );
    if (author !== undefined) {
      check.string(author.name, [...modelPath, "author", "name"]);
      check.nullableString(author.website, [...modelPath, "author", "website"]);
    }
  }

  const specifications = check.array(node.specifications, [
    ...path,
    "specifications",
  ]);
  if (specifications?.length === 0) {
    check.fail(
      [...path, "specifications"],
      "A definition carries at least one specification.",
      "a nonempty specification history",
      "an empty array",
    );
  }
  specifications?.forEach((entry, index) =>
    specification(
      check,
      entry,
      [...path, "specifications", index],
      node.formatVersion,
      typeof model?.documentType === "string" ? model.documentType : "",
    ),
  );
  if (
    node.formatVersion === 2 &&
    !specifications?.some(
      (entry) =>
        typeof entry === "object" && entry !== null && "initialAuth" in entry,
    )
  )
    check.fail(
      [...path, "formatVersion"],
      "Format 2 requires an initial authorization template.",
      "a template-bearing specification",
      "absent",
    );
  if (check.collector.diagnostics.length === 0) {
    const definition = value as DocumentModelDefinition;
    definition.specifications.forEach((specification, index) => {
      try {
        validateInitialAuthSpecification(
          specification,
          definition.model.documentType,
        );
      } catch (error) {
        check.fail(
          [...path, "specifications", index, "initialAuth"],
          error instanceof Error
            ? error.message
            : "Invalid authorization references.",
          "references to this specification's fields and operations",
          "invalid references",
        );
      }
    });
  }
  return check.collector.diagnostics;
}
