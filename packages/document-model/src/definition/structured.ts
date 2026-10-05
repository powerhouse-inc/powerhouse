import type {
  Action,
  CompiledErrorDefinition,
  DefinitionDiagnostic,
  DefinitionExample,
  DefinitionPath,
  DocumentModelDefinition,
  DocumentModelModuleDefinition,
  DocumentModelOperationDefinition,
  DocumentModelSpecificationDefinition,
  DocumentScalarReferenceDefinition,
  EnumValueDefinition,
  FieldDefinition,
  InputFieldDefinition,
  InputTypeDefinition,
  JsonValue,
  NamedGraphQLTypeDefinition,
  NonEmptyStateDefinition,
  PackageScalarReferenceDefinition,
  PowerhouseScalarName,
  SchemaFirstGraphQLDocumentCompatibility,
  Sha256Digest,
  SignalDispatch,
  StateDefinition,
  TypeReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import type { z } from "zod";
import type { SchemaFirstSpecificationCompatibility } from "./compatibility.js";
import {
  AppliedCompatibility,
  type CompatibilitySelection,
} from "./compatibility-apply.js";
import { isTypeDescriptor } from "./descriptor-registry.js";
import {
  DefinitionDiagnosticCollector,
  DocumentModelDefinitionError,
} from "./diagnostics.js";
import { nameAnonymousInput } from "./field.js";
import { checkGraphQLDocumentAgreement } from "./graphql-ast.js";
import {
  checkDerivedNameCollisions,
  type DerivedModuleNames,
  type DerivedOperationNames,
  deriveDocumentModelErrorNames,
  deriveDocumentModelModuleNames,
  deriveDocumentModelOperationNames,
  type DocumentModelNames,
} from "./naming.js";
import { canonicalDigest, compareCodeUnits } from "./primitives.js";
import { assignStoredSegments } from "./segments.js";
import { printSchemaSegment } from "./printer.js";
import {
  isCatalogBinding,
  isReferenceableScalarName,
  SCALAR_CATALOG_NAMES,
  scalarCatalog,
} from "./scalars/catalog.js";
import type { ScalarBinding } from "./scalars/types.js";
import type {
  AnyFieldDescriptor,
  AnyTypeDescriptor,
  EnumDescriptor,
  InputDescriptor,
  InterfaceDescriptor,
  ListDescriptor,
  ObjectDescriptor,
  ObjectFields,
  ReferenceDescriptor,
  ScalarDescriptor,
  StateRootDescriptor,
  UnionDescriptor,
} from "./types.js";
import {
  resolveReference,
  serializeAndValidateInitialValue,
  validatorFor,
} from "./zod.js";

/**
 * Walks a descriptor graph once and produces the versioned
 * `DocumentModelDefinition`. This is the normalized seam that both adapters
 * feed and that the GraphQL host, the check command, and every parity test
 * read instead of reparsing SDL.
 *
 * Traversal order is a contract, not an implementation detail: the global
 * state root, the local state root, auxiliary types in authored order, then
 * every module and operation in the finalized tuple. A named type is emitted
 * on first encounter and its token is marked before its children are visited,
 * so a cycle cannot change the result.
 */

export type OperationErrorClass = new (message?: string) => Error & {
  readonly errorCode: string;
};

export type OperationErrorDeclaration = {
  readonly code?: string | null;
  readonly name?: string | null;
  readonly description?: string | null;
  readonly template?: string | null;
};

export type DefinitionExampleDeclaration = {
  readonly key: string;
  readonly value: string;
};

export type OperationReducerContext = {
  readonly errors: Readonly<Record<string, OperationErrorClass>>;
  readonly action: Action;
  readonly dispatch: SignalDispatch | undefined;
};

export type OperationReducer = (
  state: any,
  input: any,
  context: OperationReducerContext,
) => void;

export type RuntimeOperationDeclaration = {
  readonly key: string;
  readonly scope: "global" | "local";
  readonly input: InputDescriptor;
  readonly description: string | null;
  readonly errors: Readonly<Record<string, OperationErrorDeclaration>>;
  readonly examples: readonly DefinitionExampleDeclaration[];
  readonly template: string | null;
  readonly reducerTemplate: string | null;
  readonly reduce: OperationReducer;
};

export type RuntimeModuleDeclaration = {
  readonly contextId: symbol;
  readonly key: string;
  readonly description: string | null;
  readonly operations: readonly RuntimeOperationDeclaration[];
};

export type ScopeDeclaration = {
  readonly root: StateRootDescriptor | null;
  readonly initialValue: unknown;
  readonly examples: readonly DefinitionExampleDeclaration[];
};

export type DocumentModelCompilationConfig = {
  readonly contextId: symbol;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly extension: string;
  readonly version: number;
  readonly author: {
    readonly name: string;
    readonly website: string | null;
  };
  readonly changeLog: readonly string[];
  readonly names: DocumentModelNames;
  readonly compatibility: SchemaFirstSpecificationCompatibility | null;
  readonly specifications: {
    readonly auxiliaryTypes: readonly AnyTypeDescriptor[];
    readonly graphQLCompatibility: SchemaFirstGraphQLDocumentCompatibility | null;
    readonly global: ScopeDeclaration & { readonly root: StateRootDescriptor };
    readonly local: ScopeDeclaration;
  };
};

export type CompiledOperation = {
  readonly declaration: RuntimeOperationDeclaration;
  readonly key: string;
  readonly id: string;
  readonly scope: "global" | "local";
  readonly actionType: string;
  readonly creatorKey: string;
  readonly storedName: string;
  readonly input: InputTypeDefinition;
  readonly inputSchema: string;
  readonly inputValidator: z.ZodType;
  readonly errorClasses: Readonly<Record<string, OperationErrorClass>>;
  readonly definition: DocumentModelOperationDefinition;
};

export type CompiledModule = {
  readonly key: string;
  readonly id: string;
  readonly storedName: string;
  readonly description: string | null;
  readonly operations: readonly CompiledOperation[];
  readonly definition: DocumentModelModuleDefinition;
};

export type CompiledDocumentModelVersion = {
  readonly config: DocumentModelCompilationConfig;
  readonly graphQLName: string;
  readonly specification: DocumentModelSpecificationDefinition;
  readonly definition: DocumentModelDefinition;
  /**
   * `sha256` over the canonical JSON of the structured definition. This is a
   * structured-data cache and comparison identity, **not** an executable
   * package revision and not evidence that reducer or resolver closures
   * behave equivalently. Tasks 028 and 032 identify executable package bytes
   * separately; host generation ownership stays deferred.
   */
  readonly definitionDigest: Sha256Digest;
  readonly types: readonly NamedGraphQLTypeDefinition[];
  readonly initialGlobalState: JsonValue;
  readonly initialLocalState: JsonValue;
  readonly modules: readonly CompiledModule[];
  /** The package scalars the specification declares, in its order. */
  readonly packageScalars: readonly ScalarBinding[];
  /**
   * The report-only diagnostics compilation raised. They never fail a
   * declaration — several catalog codes exist precisely to be reported
   * without stopping one — so they have to be reachable, or the compiler
   * would be silently accepting what it meant to flag.
   */
  readonly diagnostics: readonly DefinitionDiagnostic[];
  /** Which compatibility modes this version selected, and from which paths. */
  readonly compatibility: CompatibilitySelection;
};

type Position = "input" | "output";

/** Abandons one named definition whose failure is already recorded. */
class WalkAbort extends Error {}

function fieldDefault(field: AnyFieldDescriptor): JsonValue | undefined {
  return field.presentation.default.present
    ? field.presentation.default.value
    : undefined;
}

export class DescriptorWalk {
  readonly definitions: NamedGraphQLTypeDefinition[] = [];
  readonly scalars = new Set<string>();
  /** The package scalars the walk reached, by name. */
  readonly packageScalars = new Map<string, ScalarBinding>();
  /**
   * Which fields of each emitted object are computed.
   *
   * Kept beside the definitions rather than on them: the wire shape is the
   * published contract and its digest must not move because a subgraph
   * compiler needed a note. A document model never fills this.
   */
  readonly computedByType = new Map<string, ReadonlySet<string>>();
  readonly #collector: DefinitionDiagnosticCollector;
  readonly #built = new Map<AnyTypeDescriptor, NamedGraphQLTypeDefinition>();
  readonly #visited = new Set<AnyTypeDescriptor>();
  readonly #claims = new Map<
    string,
    { readonly token: AnyTypeDescriptor; readonly path: DefinitionPath }
  >();

  /**
   * A subgraph argument may carry a GraphQL default; a document state or
   * action input may not. The walk is otherwise identical, so the difference
   * is a flag rather than a second implementation that would drift.
   */
  readonly #allowFieldDefaults: boolean;

  constructor(
    collector: DefinitionDiagnosticCollector,
    options: { readonly allowFieldDefaults?: boolean } = {},
  ) {
    this.#collector = collector;
    this.#allowFieldDefaults = options.allowFieldDefaults === true;
  }

  /**
   * Visits one named type, emitting it into `definitions` unless the caller
   * keeps it on another node — an anonymous derived operation input stays on
   * its operation. Returns the wire definition, including for a token that was
   * already visited through another path.
   */
  visitType(
    candidate: unknown,
    position: Position,
    path: DefinitionPath,
    options: { readonly emit?: boolean } = {},
  ): NamedGraphQLTypeDefinition | undefined {
    if (!isTypeDescriptor(candidate)) {
      this.#collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path,
        message:
          "A type position must hold a named type created by a ph builder.",
        expected: "a named type descriptor",
        received: candidate === null ? "null" : typeof candidate,
        repair:
          "Use a descriptor returned by ph.enum, ph.object, ph.input, ph.interface, or ph.union.",
      });
      return undefined;
    }
    if (this.#visited.has(candidate)) return this.#built.get(candidate);
    if (!this.#claimName(candidate, path)) return undefined;
    this.#visited.add(candidate);
    const definition = this.#attempt(() =>
      this.namedDefinition(candidate, path),
    );
    if (definition === undefined) return undefined;
    this.#built.set(candidate, definition);
    if (options.emit !== false) this.definitions.push(definition);
    this.#visitChildren(candidate, position, path);
    return definition;
  }

  namedDefinition(
    descriptor: AnyTypeDescriptor,
    path: DefinitionPath,
  ): NamedGraphQLTypeDefinition {
    const name = this.#requireName(descriptor, path);
    switch (descriptor.kind) {
      case "enum":
        return {
          kind: "enum",
          name,
          description: descriptor.description,
          values: (descriptor as EnumDescriptor).values.map(
            (value): EnumValueDefinition => ({
              name: value.name,
              description: value.description,
              deprecated: value.deprecated,
            }),
          ),
        };
      case "object": {
        const object = descriptor as ObjectDescriptor;
        const implemented = object.implements.map((entry, index) =>
          this.#requireName(entry, [...path, "implements", index]),
        );
        return {
          kind: "object",
          name,
          description: descriptor.description,
          ...(implemented.length > 0 && { implements: implemented }),
          fields: [
            // Narrowed at the call site: the walk splits stored fields from
            // computed members, and `fields` never holds one of the latter.
            ...this.#requireFields(
              object.fields as ObjectFields,
              "object",
              name,
              path,
            ),
            // A computed member is a field of the GraphQL type even though no
            // source carries it. A document model never has one: `ph.field`
            // exists for subgraphs, and a state root that declared one is
            // refused before it reaches here.
            ...this.#computedFields(object, path),
          ],
        };
      }
      case "interface":
        return {
          kind: "interface",
          name,
          description: descriptor.description,
          fields: this.#requireFields(
            (descriptor as InterfaceDescriptor).fields,
            "interface",
            name,
            path,
          ),
        };
      case "input":
        return {
          kind: "input",
          name,
          description: descriptor.description,
          unknownKeys: "preserve",
          fields: this.#inputFields(
            (descriptor as InputDescriptor).fields,
            path,
          ),
        };
      case "union":
        return {
          kind: "union",
          name,
          description: descriptor.description,
          members: (descriptor as UnionDescriptor).members.map(
            (member, index) =>
              this.#requireName(member, [...path, "members", index]),
          ),
        };
    }
  }

  #attempt<T>(build: () => T): T | undefined {
    try {
      return build();
    } catch (error) {
      if (error instanceof WalkAbort) return undefined;
      if (error instanceof DocumentModelDefinitionError) {
        this.#collector.merge(error.diagnostics);
        return undefined;
      }
      throw error;
    }
  }

  /**
   * The wire reference for one field use, visiting whatever it names.
   *
   * Public because the subgraph compiler resolves entry arguments and return
   * types through the same walk: two implementations of "what does this field
   * point at" would eventually disagree about a nested list or a reference.
   */
  typeReferenceFor(
    field: AnyFieldDescriptor,
    path: DefinitionPath,
    position: Position = "output",
  ): TypeReferenceDefinition | undefined {
    try {
      const reference = this.#typeReference(field, path);
      // Resolving a reference is not the same as reaching its target: without
      // this, a type named only by an entry's return would never be emitted.
      this.#visitField(field, position, path);
      return reference;
    } catch {
      return undefined;
    }
  }

  #typeReference(
    field: AnyFieldDescriptor,
    path: DefinitionPath,
  ): TypeReferenceDefinition {
    switch (field.kind) {
      case "scalar": {
        const scalar = field as ScalarDescriptor<any, any>;
        return {
          kind: "scalar",
          name: this.#requireScalarName(scalar, path),
          required: scalar.required,
        };
      }
      case "list": {
        const list = field as ListDescriptor<any, any>;
        return {
          kind: "list",
          required: list.required,
          item: this.#typeReference(list.item, [...path, "item"]),
        };
      }
      case "ref": {
        const reference = field as ReferenceDescriptor<any, any>;
        const target = this.#resolve(reference, path);
        if (target === undefined) throw new WalkAbort();
        return {
          kind: "named",
          name: this.#requireName(target, path),
          required: reference.required,
        };
      }
    }
  }

  /**
   * GraphQL requires at least one field on an object or an interface, and no
   * valid schema can contain one without. An empty input is the only
   * member-less type V1 admits, because it projects `_empty: Boolean`.
   */
  #requireFields(
    fields: ObjectFields,
    kind: "object" | "interface",
    name: string,
    path: DefinitionPath,
  ): FieldDefinition[] {
    if (Object.keys(fields).length === 0) {
      this.#collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [...path, "fields"],
        message: `The ${kind} type ${JSON.stringify(name)} declares no fields, and GraphQL cannot build a schema that contains it.`,
        expected: "at least one field",
        received: "no fields",
        repair: `Give ${JSON.stringify(name)} a field, or remove it from the model. Only ph.input({ fields: {} }) may be member-less, because it projects _empty: Boolean.`,
      });
      throw new WalkAbort();
    }
    return this.#fields(fields, path);
  }

  #computedFields(
    object: ObjectDescriptor,
    path: DefinitionPath,
  ): FieldDefinition[] {
    const computed = (object as { computed?: Record<string, unknown> })
      .computed;
    if (computed === undefined || Object.keys(computed).length === 0) return [];
    this.computedByType.set(object.name, new Set(Object.keys(computed)));
    return Object.entries(computed).map(([key, member]) => {
      const declaration = member as {
        returns: AnyFieldDescriptor;
        args?: ObjectFields;
        description: string | null;
        deprecated: string | null;
      };
      return {
        key,
        name: key,
        description: declaration.description,
        deprecated: declaration.deprecated,
        type: this.#typeReference(declaration.returns, [
          ...path,
          "computed",
          key,
        ]),
        ...(declaration.args !== undefined &&
          Object.keys(declaration.args).length > 0 && {
            args: this.#inputFields(declaration.args, [
              ...path,
              "computed",
              key,
              "args",
            ]),
          }),
      };
    });
  }

  #fields(fields: ObjectFields, path: DefinitionPath): FieldDefinition[] {
    return Object.entries(fields).map(([key, field]) => ({
      key,
      name: key,
      description: field.presentation.description,
      deprecated: field.presentation.deprecated,
      type: this.#typeReference(field, [...path, "fields", key]),
    }));
  }

  #inputFields(
    fields: ObjectFields,
    path: DefinitionPath,
  ): InputFieldDefinition[] {
    return Object.entries(fields).map(([key, field]) => {
      const defaultValue = fieldDefault(field);
      return {
        key,
        name: key,
        description: field.presentation.description,
        deprecated: field.presentation.deprecated,
        type: this.#typeReference(field, [...path, "fields", key]),
        ...(defaultValue !== undefined && { defaultValue }),
      };
    });
  }

  #visitChildren(
    descriptor: AnyTypeDescriptor,
    position: Position,
    path: DefinitionPath,
  ): void {
    switch (descriptor.kind) {
      case "enum":
        return;
      case "input":
        this.#visitFields(
          (descriptor as InputDescriptor).fields,
          "input",
          path,
        );
        return;
      case "interface":
        this.#visitFields(
          (descriptor as InterfaceDescriptor).fields,
          "output",
          path,
        );
        return;
      case "union":
        (descriptor as UnionDescriptor).members.forEach((member, index) =>
          this.visitType(member, "output", [...path, "members", index]),
        );
        return;
      case "object": {
        const object = descriptor as ObjectDescriptor;
        object.implements.forEach((entry, index) =>
          this.visitType(entry, "output", [...path, "implements", index]),
        );
        this.#visitFields(object.fields as ObjectFields, position, path);
        // A computed member's return type and arguments are reachable too: a
        // type named only from one still has to be emitted.
        const computed = (object as { computed?: Record<string, unknown> })
          .computed;
        for (const [key, member] of Object.entries(computed ?? {})) {
          const declaration = member as {
            returns: AnyFieldDescriptor;
            args?: ObjectFields;
          };
          this.#visitField(declaration.returns, "output", [
            ...path,
            "computed",
            key,
          ]);
          this.#visitFields(declaration.args ?? {}, "input", [
            ...path,
            "computed",
            key,
            "args",
          ]);
        }
        return;
      }
    }
  }

  #visitFields(
    fields: ObjectFields,
    position: Position,
    path: DefinitionPath,
  ): void {
    for (const [key, field] of Object.entries(fields)) {
      this.#visitField(field, position, [...path, "fields", key]);
    }
  }

  #visitField(
    field: AnyFieldDescriptor,
    position: Position,
    path: DefinitionPath,
  ): void {
    if (!this.#allowFieldDefaults && fieldDefault(field) !== undefined) {
      this.#collector.add({
        code: "PH-DM-DEFAULT-UNSUPPORTED",
        path,
        message:
          "A document state or action input field cannot declare a GraphQL default value.",
        expected: "no defaultValue on a document-model field use",
        received: "defaultValue",
        repair:
          "Remove defaultValue; set the value in the scope initial value or in the reducer. A compatible stored default enters only through an explicit compatibility declaration.",
      });
    }
    switch (field.kind) {
      case "scalar":
        this.scalars.add((field as ScalarDescriptor<any, any>).scalarName);
        return;
      case "list":
        this.#visitField((field as ListDescriptor<any, any>).item, position, [
          ...path,
          "item",
        ]);
        return;
      case "ref": {
        const target = this.#resolve(
          field as ReferenceDescriptor<any, any>,
          path,
        );
        if (target === undefined) return;
        // Every reference edge is checked, including an edge to a token
        // already visited through another path.
        if (!this.#checkPosition(target, position, path)) return;
        this.visitType(target, position, path);
        return;
      }
    }
  }

  #resolve(
    reference: ReferenceDescriptor<any, any>,
    path: DefinitionPath,
  ): AnyTypeDescriptor | undefined {
    try {
      return resolveReference(reference);
    } catch (error) {
      // A lazy target is reported at the authored path, not at the builder's
      // own `target` path.
      if (error instanceof DocumentModelDefinitionError) {
        for (const diagnostic of error.diagnostics) {
          this.#collector.add({
            code: "PH-DEF-REFERENCE-TARGET-INVALID",
            path,
            message: diagnostic.message,
            ...(diagnostic.received !== undefined && {
              received: diagnostic.received,
            }),
            repair: diagnostic.repair,
          });
        }
        return undefined;
      }
      this.#collector.add({
        code: "PH-DEF-REFERENCE-TARGET-INVALID",
        path,
        message: `A ph.ref target could not be resolved: ${error instanceof Error ? error.message : String(error)}`,
        repair:
          "Return an initialized named type from the thunk passed to ph.ref.",
      });
      return undefined;
    }
  }

  #checkPosition(
    target: AnyTypeDescriptor,
    position: Position,
    path: DefinitionPath,
  ): boolean {
    const allowed =
      position === "input"
        ? target.kind === "input" || target.kind === "enum"
        : target.kind !== "input";
    if (allowed) return true;
    this.#collector.add({
      code: "PH-DM-TYPE-POSITION-INVALID",
      path,
      message: `The ${target.kind} type ${JSON.stringify(target.name)} cannot be referenced from an ${position} position.`,
      expected:
        position === "input"
          ? "a ph.input or ph.enum type"
          : "an object, interface, enum, or union type",
      received: `${target.kind} ${JSON.stringify(target.name)}`,
      repair:
        position === "input"
          ? "Reference a ph.input or ph.enum type from an operation input."
          : "Reference an output type from document state; an input type cannot be part of stored state.",
    });
    return false;
  }

  #claimName(descriptor: AnyTypeDescriptor, path: DefinitionPath): boolean {
    if (descriptor.name === null) return true;
    if (this.packageScalars.has(descriptor.name)) {
      this.#scalarTypeCollision(descriptor.name, path);
      return false;
    }
    const claim = this.#claims.get(descriptor.name);
    if (claim === undefined) {
      this.#claims.set(descriptor.name, { token: descriptor, path });
      return true;
    }
    if (claim.token === descriptor) return true;
    this.#collector.add({
      code: "PH-DM-DUPLICATE-NAME",
      path,
      message: `GraphQL type name ${JSON.stringify(descriptor.name)} is claimed by two different descriptors.`,
      expected: "one descriptor per GraphQL type name",
      received: descriptor.name,
      repair:
        "Rename one of the two types, or reuse the same descriptor token in both places.",
      related: [
        {
          path: claim.path,
          message: `The other descriptor named ${JSON.stringify(descriptor.name)} was declared here.`,
        },
      ],
    });
    return false;
  }

  /**
   * The name a scalar field use references. A GraphQL built-in carries no
   * binding. A catalog scalar carries a catalog binding, possibly from
   * another copy of this package. Any other binding is a package scalar,
   * which the definition then declares itself.
   */
  #requireScalarName(
    scalar: ScalarDescriptor<any, any>,
    path: DefinitionPath,
  ): string {
    const name = scalar.scalarName;
    const binding = scalar.binding;
    if (binding === undefined) {
      if (isReferenceableScalarName(name)) return name;
      this.#collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path,
        message: `Scalar ${name} is neither in the compiler catalog nor compiled by defineScalar.`,
        expected: [...SCALAR_CATALOG_NAMES].join(" | "),
        received: name,
        repair: `Declare ${name} with defineScalar and use the factory it returns, or use a catalog scalar.`,
      });
      throw new WalkAbort();
    }
    if (isReferenceableScalarName(name)) {
      if (isCatalogBinding(binding)) return name;
      this.#collector.add({
        code: "PH-SCALAR-DUPLICATE-NAME",
        definition: { kind: "scalar", key: name },
        path,
        message: `A package scalar is named ${name}, which is a ${scalarCatalog.names.includes(name as PowerhouseScalarName) ? "catalog scalar" : "GraphQL built-in"}.`,
        received: name,
        repair: `Rename the scalar passed to defineScalar; the name ${name} is taken.`,
      });
      throw new WalkAbort();
    }
    const known = this.packageScalars.get(name);
    if (known !== undefined && !sameScalar(known, binding)) {
      this.#collector.add({
        code: "PH-SCALAR-DUPLICATE-NAME",
        definition: { kind: "scalar", key: name },
        path,
        message: `Two different package scalars are named ${name}.`,
        received: name,
        repair: `Declare ${name} once with defineScalar and import that factory everywhere it is used.`,
      });
      throw new WalkAbort();
    }
    if (known === undefined && this.#claims.has(name)) {
      this.#scalarTypeCollision(name, path);
      throw new WalkAbort();
    }
    this.packageScalars.set(name, known ?? binding);
    return name;
  }

  #scalarTypeCollision(name: string, path: DefinitionPath): void {
    this.#collector.add({
      code: "PH-DM-DUPLICATE-NAME",
      path,
      message: `GraphQL name ${JSON.stringify(name)} is claimed by a package scalar and a named type.`,
      expected: "one GraphQL definition per name",
      received: name,
      repair: "Rename the scalar or the type.",
    });
  }

  #requireName(descriptor: AnyTypeDescriptor, path: DefinitionPath): string {
    if (descriptor.name !== null) return descriptor.name;
    this.#collector.add({
      code: "PH-DEF-REFERENCE-TARGET-INVALID",
      path,
      message: "An anonymous input has no GraphQL name in this position.",
      repair:
        'Name the input as ph.input("PagingInput", { fields }), or use it as one operation input.',
    });
    throw new WalkAbort();
  }
}

type IdentityResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false };

type ExampleIdentity = (key: string, path: DefinitionPath) => IdentityResult;

function exampleDefinitions(
  collector: DefinitionDiagnosticCollector,
  examples: readonly DefinitionExampleDeclaration[],
  path: DefinitionPath,
  identity: ExampleIdentity,
): DefinitionExample[] {
  const keys = new Map<string, number>();
  const definitions: DefinitionExample[] = [];
  examples.forEach((example, index) => {
    const examplePath = [...path, index];
    const first = keys.get(example.key);
    if (first !== undefined) {
      collector.add({
        code: "PH-DM-IDENTITY-INVALID",
        path: [...examplePath, "key"],
        message: `Example key ${JSON.stringify(example.key)} is declared twice, so both examples would derive one ID.`,
        expected: "a unique stable key for every example in this declaration",
        received: example.key,
        repair: "Give each example its own stable key.",
        related: [
          {
            path: [...path, first, "key"],
            message: "The first example with this key was declared here.",
          },
        ],
      });
      return;
    }
    keys.set(example.key, index);
    const derived = identity(example.key, [...examplePath, "key"]);
    if (!derived.ok) return;
    definitions.push({
      id: derived.id,
      key: example.key,
      value: example.value,
    });
  });
  return definitions;
}

function materializedExamples(
  examples: readonly DefinitionExample[],
): readonly Omit<DefinitionExample, "key">[] {
  return examples.map(({ id, value }) => ({ id, value }));
}

function errorDefinitions(
  collector: DefinitionDiagnosticCollector,
  compatibility: AppliedCompatibility,
  documentType: string,
  moduleKey: string,
  operation: RuntimeOperationDeclaration,
  path: DefinitionPath,
): CompiledErrorDefinition[] {
  const definitions: CompiledErrorDefinition[] = [];
  for (const [key, declaration] of Object.entries(operation.errors)) {
    const errorPath = [...path, "errors", key];
    const derived = compatibility.id(
      {
        kind: "error",
        documentType,
        moduleKey,
        operationKey: operation.key,
        errorKey: key,
      },
      errorPath,
    );
    if (!derived.ok) continue;
    const names = deriveDocumentModelErrorNames(key, {
      name: declaration.name ?? null,
      code: declaration.code ?? null,
    });
    definitions.push({
      id: derived.id,
      key,
      code: names.storedCode,
      name: names.storedName,
      description: declaration.description ?? null,
      template: declaration.template ?? null,
    });
  }
  return definitions;
}

/**
 * The runtime error class for one reducer-facing key. Its `errorCode` and its
 * default message both come from that key, exactly as the current generator
 * derives them from the Pascal-cased specification `name`. The stored `code`
 * stays independent metadata that the class never reads.
 */
function createOperationErrorClass(key: string): OperationErrorClass {
  // `name` is deliberately left as `Error`, matching the generated class
  // (`codegen/src/templates/document-model/gen/modules/error.ts`), which sets
  // only `errorCode` and the default message. A reducer author's own
  // `catch (error) { error.name }` has to see the same string either way.
  return class extends Error {
    readonly errorCode = key;

    constructor(message: string = key) {
      super(message);
    }
  };
}

/**
 * Whether two package scalar bindings are one scalar. The same declaration
 * evaluated by two copies of a module yields two binding objects that agree
 * on the definition and on the source text generated code validates with. A
 * validator cannot be compared, so two declarations that differ only there
 * are one scalar to the compiler.
 */
export function sameScalar(a: ScalarBinding, b: ScalarBinding): boolean {
  return (
    a === b ||
    (a.zodSource === b.zodSource &&
      a.typescriptType === b.typescriptType &&
      canonicalDigest(a.definition) === canonicalDigest(b.definition))
  );
}

/** The package scalars a walk reached, in the order a definition lists them. */
export function orderedPackageScalars(
  packageScalars: ReadonlyMap<string, ScalarBinding>,
): readonly ScalarBinding[] {
  return [...packageScalars.keys()]
    .sort(compareCodeUnits)
    .map((name) => packageScalars.get(name)!);
}

function scalarReferences(
  names: ReadonlySet<string>,
  packageScalars: readonly ScalarBinding[],
): readonly DocumentScalarReferenceDefinition[] {
  // Fixed catalog order, so one reached set produces one array on every host.
  // Only the reference is recorded: copying a member's coercion contract would
  // churn every model digest whenever a catalog description changed.
  const catalog = scalarCatalog.names
    .filter((name) => names.has(name))
    .map(
      (name: PowerhouseScalarName) =>
        ({
          name,
          implementation: `powerhouse.catalog#${name}`,
          coercionProfile: "document-engineering-1.40",
        }) as DocumentScalarReferenceDefinition,
    );
  // A package scalar has no catalog to be looked up in, so its definition is
  // part of the model's own contract.
  const declared = packageScalars.map(
    ({ definition }): PackageScalarReferenceDefinition => ({
      name: definition.name,
      implementation: `package#${definition.name}`,
      coercionProfile: "document-engineering-1.40",
      definition,
    }),
  );
  return [...catalog, ...declared];
}

function nonEmptyState(
  name: string,
  initialValue: MaterializedInitialValue,
  examples: readonly DefinitionExample[],
  schema: string,
  serializedInitialValue: string,
): NonEmptyStateDefinition {
  return {
    root: { kind: "named", name, required: true },
    initialValue: initialValue.value,
    examples,
    unknownKeys: "preserve",
    materialized: {
      schema,
      initialValue: serializedInitialValue,
      examples: materializedExamples(examples),
    },
  };
}

type MaterializedInitialValue = {
  readonly value: JsonValue;
  readonly serialized: string;
};

/**
 * Materializes one scope's initial value with the platform's current
 * `JSON.stringify` behavior and validates the parsed value with the generated
 * schema, ignoring Zod's returned copy. This runs after the descriptor
 * traversal, so a broken reference is reported at its authored coordinate
 * instead of as a validation failure inside a lazy schema.
 */
function materializeInitialValue(
  collector: DefinitionDiagnosticCollector,
  root: StateRootDescriptor,
  rootName: string,
  scope: "global" | "local",
  value: unknown,
): MaterializedInitialValue | undefined {
  const materialized = collector.capture(() =>
    serializeAndValidateInitialValue(root, value),
  );
  if (materialized === undefined) return undefined;
  if (materialized.ok) {
    return { value: materialized.value, serialized: materialized.serialized };
  }
  collector.add({
    code: "PH-DM-INITIAL-VALUE-INVALID",
    path: ["specifications", scope, "initialValue"],
    message:
      materialized.reason === "not-serializable"
        ? "This initial value cannot produce a stored JSON string."
        : `The ${rootName} schema rejects this initial value.`,
    expected: `a value ${rootName} accepts and JSON.stringify can serialize`,
    received: materialized.message,
    repair:
      materialized.reason === "not-serializable"
        ? "Replace the value with JSON data; a stored initial value must serialize."
        : "Correct the initial value so the declared state schema accepts it.",
  });
  return undefined;
}

export function compileDocumentModelVersion(
  config: DocumentModelCompilationConfig,
  modules: readonly RuntimeModuleDeclaration[],
): CompiledDocumentModelVersion {
  const collector = new DefinitionDiagnosticCollector({
    kind: "document-model",
    key: config.id,
    version: config.version,
  });
  const walk = new DescriptorWalk(collector);
  const compatibility = new AppliedCompatibility(
    collector,
    config.compatibility,
  );
  const documentType = config.names.documentType;
  const identities = new Map<string, DefinitionPath>();

  const claimIdentity = (id: string, path: DefinitionPath): void => {
    const first = identities.get(id);
    if (first !== undefined) {
      // A derived collision is a compiler-visible mistake: two declarations
      // with one key. A stored collision is data that already exists —
      // `document-drive` gives SET_DRIVE_ICON and REMOVE_TRIGGER one ID — and
      // rewriting it would break the stored-byte parity explicit identity
      // exists to keep. So the stored case is reported, not rejected.
      const explicit = compatibility.identityMode === "explicit-schema-first";
      collector.add({
        code: explicit ? "PH-DM-IDENTITY-REUSED" : "PH-DM-IDENTITY-INVALID",
        path,
        message: explicit
          ? `The stored specification reuses ID ${id} for two declarations.`
          : `Specification ID ${id} is already claimed by another declaration.`,
        expected: "one ID per module, operation, error, and example",
        received: id,
        repair: explicit
          ? "Nothing to repair here: the installed specification already carries this ID twice, and changing it would change persisted bytes. Correcting it belongs to the model it came from."
          : "Give the two declarations distinct keys.",
        related: [{ path: first, message: "First claimed here." }],
      });
      return;
    }
    identities.set(id, path);
  };

  // 1. The state roots, then the authored auxiliary inventory. Auxiliary types
  //    are an inventory, not a second ownership graph: a type already reached
  //    from a root is emitted once.
  walk.visitType(config.specifications.global.root, "output", [
    "specifications",
    "global",
    "schema",
  ]);
  if (config.specifications.local.root !== null) {
    walk.visitType(config.specifications.local.root, "output", [
      "specifications",
      "local",
      "schema",
    ]);
  }
  config.specifications.auxiliaryTypes.forEach((descriptor, index) =>
    walk.visitType(descriptor, "output", [
      "specifications",
      "auxiliaryTypes",
      index,
    ]),
  );

  // 2. Every module and operation, in the finalized tuple order.
  const moduleKeys = new Map<string, number>();
  const derivedNames: DerivedModuleNames[] = [];
  // The stored operation SDL needs the complete type inventory, so the loop
  // collects drafts and the segments are printed after the traversal.
  const draftModules: CompiledModule[] = [];

  modules.forEach((module, moduleIndex) => {
    const modulePath: DefinitionPath = ["modules", moduleIndex];
    if (module.contextId !== config.contextId) {
      collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: modulePath,
        message:
          "This module was created by a different document-model context.",
        expected: `a module of ${JSON.stringify(config.id)}`,
        received: "a module of another document-model context",
        repair:
          "Finalize only the modules returned by this context's module() call; a same-shaped state type does not grant ownership of another model's token.",
      });
      return;
    }
    const firstModule = moduleKeys.get(module.key);
    if (firstModule !== undefined) {
      collector.add({
        code: "PH-DM-DUPLICATE-NAME",
        path: [...modulePath, "key"],
        message: `Module key ${JSON.stringify(module.key)} is declared twice.`,
        expected: "a unique key for every module in a version",
        received: module.key,
        repair: "Rename one of the two modules.",
        related: [
          {
            path: ["modules", firstModule, "key"],
            message: "The first module with this key was declared here.",
          },
        ],
      });
      return;
    }
    moduleKeys.set(module.key, moduleIndex);

    const moduleNames = deriveDocumentModelModuleNames(
      config.name,
      module.key,
      compatibility.names(`module/${module.key}`),
    );
    const moduleIdentity = compatibility.id(
      { kind: "module", documentType, moduleKey: module.key },
      [...modulePath, "key"],
    );
    if (moduleIdentity.ok) {
      claimIdentity(moduleIdentity.id, [...modulePath, "id"]);
    }

    const errorClasses = new Map<string, OperationErrorClass>();
    const operations: CompiledOperation[] = [];
    const derivedOperations: DerivedOperationNames[] = [];

    module.operations.forEach((operation, operationIndex) => {
      const operationPath: DefinitionPath = [
        ...modulePath,
        "operations",
        operationIndex,
      ];
      const names = deriveDocumentModelOperationNames(
        operation.key,
        compatibility.names(`operation/${module.key}/${operation.key}`),
      );
      derivedOperations.push({ key: operation.key, names });
      if (names.creatorKey !== operation.key) {
        // The runtime actions map is keyed by the derived creator key while the
        // finalized type is keyed by the authored key. Rejecting the mismatch
        // keeps `actions.<key>` from typechecking against a key the runtime
        // map does not carry.
        collector.add({
          code: "PH-DM-DECLARATION-INVALID",
          path: [...operationPath, "key"],
          message: `Operation key ${JSON.stringify(operation.key)} derives creator key ${JSON.stringify(names.creatorKey)}, so the typed and the runtime action creator keys would differ.`,
          expected: names.creatorKey,
          received: operation.key,
          repair: `Rename the operation to ${JSON.stringify(names.creatorKey)}.`,
        });
      }

      const operationIdentity = compatibility.id(
        {
          kind: "operation",
          documentType,
          moduleKey: module.key,
          operationKey: operation.key,
        },
        [...operationPath, "key"],
      );
      if (operationIdentity.ok) {
        claimIdentity(operationIdentity.id, [...operationPath, "id"]);
      }

      const inputPath = [...operationPath, "input"];
      if (
        operation.input.name !== null &&
        operation.input.name !== names.inputTypeName
      ) {
        // Both consumers derive an operation's input type name from the
        // operation name: codegen reads `pascalCase(name) + "Input"` out of the
        // operation's own segment, and the host builds the same name for its
        // mutation argument. A differently named input, or one input type
        // shared by two operations, has no stored representation.
        collector.add({
          code: "PH-DM-DECLARATION-INVALID",
          path: inputPath,
          message: `Operation ${JSON.stringify(operation.key)} declares the input type ${JSON.stringify(operation.input.name)}, but the stored format binds an operation's input type name to the operation.`,
          expected: names.inputTypeName,
          received: operation.input.name,
          repair: `Declare the input inline as ph.input({ fields: { ... } }), referencing a shared named input from a field when several operations need the same fields, or name it ${JSON.stringify(names.inputTypeName)}.`,
        });
        return;
      }
      // Contextual naming returns a named view; the authored token stays
      // anonymous, so one reused input can take a different name per
      // operation.
      const contextualInput = collector.capture(() =>
        nameAnonymousInput(operation.input, names.inputTypeName),
      );
      if (contextualInput === undefined) return;
      const anonymous = operation.input.name === null;
      const input = walk.visitType(contextualInput, "input", inputPath, {
        // A named input is a reusable definition and belongs in `types`; an
        // anonymous derived input stays on its operation node.
        emit: !anonymous,
      });
      if (input === undefined || input.kind !== "input") return;

      const errors = errorDefinitions(
        collector,
        compatibility,
        documentType,
        module.key,
        operation,
        operationPath,
      );
      errors.forEach((error) =>
        claimIdentity(error.id, [...operationPath, "errors", error.key, "id"]),
      );
      const operationErrorClasses: Record<string, OperationErrorClass> = {};
      for (const key of Object.keys(operation.errors)) {
        // One runtime class per reducer-facing key in a module, matching the
        // generator's module-wide deduplication, while every operation keeps
        // its own complete stored occurrence.
        let ErrorClass = errorClasses.get(key);
        if (ErrorClass === undefined) {
          ErrorClass = createOperationErrorClass(key);
          errorClasses.set(key, ErrorClass);
        }
        operationErrorClasses[key] = ErrorClass;
      }

      const examples = exampleDefinitions(
        collector,
        operation.examples,
        [...operationPath, "examples"],
        (key, path) =>
          compatibility.id(
            {
              kind: "operation-example",
              documentType,
              moduleKey: module.key,
              operationKey: operation.key,
              exampleKey: key,
            },
            path,
          ),
      );
      examples.forEach((example) =>
        claimIdentity(example.id, [
          ...operationPath,
          "examples",
          example.key,
          "id",
        ]),
      );

      if (!operationIdentity.ok) return;
      operations.push({
        declaration: operation,
        key: operation.key,
        id: operationIdentity.id,
        scope: operation.scope,
        actionType: names.actionType,
        creatorKey: names.creatorKey,
        storedName: names.storedName,
        input,
        inputSchema: "",
        inputValidator: validatorFor(contextualInput, "input"),
        errorClasses: Object.freeze(operationErrorClasses),
        definition: {
          id: operationIdentity.id,
          key: operation.key,
          name: names.storedName,
          description: operation.description,
          actionType: names.actionType,
          creatorKey: names.creatorKey,
          scope: operation.scope,
          input,
          errors,
          examples,
          template: operation.template,
          reducer: operation.reducerTemplate,
        },
      });
    });

    derivedNames.push({
      key: module.key,
      names: moduleNames,
      operations: derivedOperations,
    });
    if (!moduleIdentity.ok) return;
    draftModules.push({
      key: module.key,
      id: moduleIdentity.id,
      storedName: moduleNames.storedName,
      description: module.description,
      operations,
      definition: {
        id: moduleIdentity.id,
        key: module.key,
        name: moduleNames.storedName,
        description: module.description,
        operations: operations.map((operation) => operation.definition),
      },
    });
  });

  // 3. Derived-name and action-type collisions over the complete model, not
  //    per module: neither switch order nor object assignment may decide
  //    dispatch.
  collector.merge(checkDerivedNameCollisions(derivedNames));

  // 4. State examples and their derived identity.
  const globalExamples = exampleDefinitions(
    collector,
    config.specifications.global.examples,
    ["specifications", "global", "examples"],
    (key, path) =>
      compatibility.id(
        {
          kind: "state-example",
          documentType,
          scope: "global",
          exampleKey: key,
        },
        path,
      ),
  );
  globalExamples.forEach((example) =>
    claimIdentity(example.id, [
      "specifications",
      "global",
      "examples",
      example.key,
      "id",
    ]),
  );
  const localExamples = exampleDefinitions(
    collector,
    config.specifications.local.examples,
    ["specifications", "local", "examples"],
    (key, path) =>
      compatibility.id(
        {
          kind: "state-example",
          documentType,
          scope: "local",
          exampleKey: key,
        },
        path,
      ),
  );
  localExamples.forEach((example) =>
    claimIdentity(example.id, [
      "specifications",
      "local",
      "examples",
      example.key,
      "id",
    ]),
  );

  collector.throwIfFailed();

  const inventory: readonly NamedGraphQLTypeDefinition[] = walk.definitions;
  const globalName = config.names.globalStateRootName;
  const localRoot = config.specifications.local.root;
  const localName = localRoot === null ? null : config.names.localStateRootName;
  const segments = assignStoredSegments({
    types: inventory,
    globalRoot: globalName,
    localRoot: localName,
    operations: draftModules.flatMap((module) =>
      module.operations.map((operation) => ({
        key: `${module.key}/${operation.key}`,
        input: operation.input,
      })),
    ),
  });
  const globalDefinitions = segments.global;
  const localDefinitions = segments.local;

  const globalInitialValue = materializeInitialValue(
    collector,
    config.specifications.global.root,
    globalName,
    "global",
    config.specifications.global.initialValue,
  );
  const localInitialValue =
    localRoot === null
      ? ({ value: {}, serialized: "{}" } satisfies MaterializedInitialValue)
      : materializeInitialValue(
          collector,
          localRoot,
          config.names.localStateRootName,
          "local",
          config.specifications.local.initialValue,
        );
  collector.throwIfFailed();
  if (globalInitialValue === undefined || localInitialValue === undefined) {
    throw new TypeError("A state initial value could not be materialized.");
  }

  const local: StateDefinition =
    localRoot === null || localName === null
      ? {
          root: null,
          initialValue: {},
          examples: localExamples,
          unknownKeys: "preserve",
          materialized: {
            // An empty local state has no schema to retain: a nonempty stored
            // schema means the scope is not empty. An override for this path
            // is reported as surplus instead.
            schema: "",
            initialValue: compatibility.initialValue(
              "state/local/initialValue",
              "{}",
              {},
              ["specifications", "local", "initialValue"],
            ),
            examples: materializedExamples(localExamples),
          },
        }
      : nonEmptyState(
          localName,
          localInitialValue,
          localExamples,
          compatibility.serialization(
            "state/local/schema",
            printSchemaSegment(localDefinitions),
          ),
          compatibility.initialValue(
            "state/local/initialValue",
            localInitialValue.serialized,
            localInitialValue.value,
            ["specifications", "local", "initialValue"],
          ),
        );

  // An operation segment declares its own input, plus the input-position types
  // it reaches that no earlier segment declares. A document-model field cannot
  // carry a default, so no named-type inventory is needed to print one.
  const compiledModules: readonly CompiledModule[] = draftModules.map(
    (module) => ({
      ...module,
      operations: module.operations.map((operation) => {
        const path = `${module.key}/${operation.key}`;
        return {
          ...operation,
          inputSchema: compatibility.serialization(
            `operation/${path}/schema`,
            printSchemaSegment(
              segments.operations.get(path) ?? [operation.input],
            ),
          ),
        };
      }),
    }),
  );

  const packageScalars = orderedPackageScalars(walk.packageScalars);
  const specification: DocumentModelSpecificationDefinition = {
    version: config.version,
    scalars: scalarReferences(walk.scalars, packageScalars),
    graphQLCompatibility: config.specifications.graphQLCompatibility,
    types: inventory,
    state: {
      global: nonEmptyState(
        globalName,
        globalInitialValue,
        globalExamples,
        compatibility.serialization(
          "state/global/schema",
          printSchemaSegment(globalDefinitions),
        ),
        compatibility.initialValue(
          "state/global/initialValue",
          globalInitialValue.serialized,
          globalInitialValue.value,
          ["specifications", "global", "initialValue"],
        ),
      ),
      local,
    },
    modules: compiledModules.map((module) => module.definition),
    changeLog: [...config.changeLog],
  };

  if (config.specifications.graphQLCompatibility !== null) {
    collector.merge(
      checkGraphQLDocumentAgreement({
        compatibility: config.specifications.graphQLCompatibility,
        definitions: [
          ...inventory,
          ...compiledModules.flatMap((module) =>
            module.operations.map((operation) => operation.input),
          ),
        ],
        path: ["specifications", "graphQLCompatibility"],
      }),
    );
  }

  const definition: DocumentModelDefinition = {
    kind: "powerhouse.document-model",
    formatVersion: 1,
    compatibility: {
      // The three modes are independent: selecting one never enables another.
      identity: compatibility.identityMode,
      scalarCoercion: "document-engineering-1.40",
      serialization: compatibility.serializationMode,
    },
    model: {
      documentType,
      graphQLName: config.names.graphQLName,
      name: config.name,
      description: config.description,
      extension: config.extension,
      author: { name: config.author.name, website: config.author.website },
    },
    specifications: [specification],
  };

  compatibility.finish();
  collector.throwIfFailed();

  return {
    config,
    graphQLName: config.names.graphQLName,
    specification,
    definition,
    definitionDigest: canonicalDigest(definition),
    types: inventory,
    initialGlobalState: globalInitialValue.value,
    initialLocalState: localInitialValue.value,
    modules: compiledModules,
    packageScalars,
    diagnostics: collector.diagnostics,
    compatibility: compatibility.selection,
  };
}
