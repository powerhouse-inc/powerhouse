import type { AttachmentRef } from "@powerhousedao/reactor";
import { generatorTypeDefs } from "@powerhousedao/document-engineering/graphql";
import type {
  Action,
  DocumentModelModule,
  DocumentSpecification,
  OperationSpecification,
} from "@powerhousedao/shared/document-model";
import { constantCase, pascalCase } from "change-case";
import {
  buildASTSchema,
  getNamedType,
  isInputObjectType,
  isListType,
  isNonNullType,
  Kind,
  parse,
  type DocumentNode,
  type GraphQLInputObjectType,
  type GraphQLInputType,
  type GraphQLSchema,
} from "graphql";
import { parseRef } from "../ref.js";
import type {
  CompiledAttachmentExtractor,
  IAttachmentSchemaCompiler,
} from "./types.js";

const ATTACHMENT_REF_TYPE = "AttachmentRef";
const CODEGEN_SCALAR_NAMES = new Set([
  "Unknown",
  "DateTime",
  "Address",
  ATTACHMENT_REF_TYPE,
  ...Object.keys(generatorTypeDefs as Record<string, string>),
]);

type CompilerContext = {
  actionType: string;
  documentType: string;
  version: number;
};

type ParsedOperation = {
  document: DocumentNode | null;
  operation: OperationSpecification;
};

type ObjectPlan = {
  fields: FieldPlan[];
};

type FieldPlan = {
  hasDefault: boolean;
  name: string;
  value: ValuePlan;
};

type ReadFieldResult =
  | { present: false; value: undefined }
  | { present: true; value: unknown };

type ValuePlan =
  | {
      kind: "attachment";
      required: boolean;
    }
  | {
      item: ValuePlan;
      kind: "list";
      required: boolean;
    }
  | {
      body: ObjectPlan;
      kind: "object";
      required: boolean;
    };

function describeContext(context: CompilerContext): string {
  return `document type "${context.documentType}", version ${context.version}, action "${context.actionType}"`;
}

function compilationError(context: CompilerContext, reason: string): Error {
  return new Error(
    `Attachment schema compilation failed for ${describeContext(context)}: ${reason}`,
  );
}

function extractionError(
  context: CompilerContext,
  path: string,
  reason: string,
): Error {
  return new Error(
    `Attachment extraction failed for ${describeContext(context)} at ${path}: ${reason}`,
  );
}

function applicableSpecification(
  module: DocumentModelModule,
  context: CompilerContext,
): DocumentSpecification {
  const matches = module.documentModel.global.specifications.filter(
    (specification) => specification.version === context.version,
  );
  if (matches.length !== 1) {
    throw compilationError(
      context,
      matches.length === 0
        ? "the module has no matching specification"
        : "the module has multiple matching specifications",
    );
  }
  return matches[0];
}

function parseOperations(
  specification: DocumentSpecification,
  context: CompilerContext,
): ParsedOperation[] {
  return specification.modules.flatMap((moduleSpecification) =>
    moduleSpecification.operations.map((operation) => {
      if (operation.schema === null) return { document: null, operation };
      try {
        return { document: parse(operation.schema), operation };
      } catch {
        throw compilationError(context, "an operation has invalid GraphQL SDL");
      }
    }),
  );
}

function selectOperation(
  operations: ParsedOperation[],
  context: CompilerContext,
): ParsedOperation | null {
  const matches = operations.filter(
    ({ operation }) =>
      operation.name !== null &&
      constantCase(operation.name) === context.actionType,
  );
  if (matches.length > 1) {
    throw compilationError(context, "multiple operations map to the action");
  }
  // Base/system actions (document creation, renames, undo) are not part of a
  // model's specification, so they cannot declare AttachmentRef fields.
  // They compile to the no-reference fast path instead of failing the stream.
  if (matches.length === 0) return null;
  return matches[0];
}

function buildEffectiveSchema(
  specification: DocumentSpecification,
  context: CompilerContext,
): GraphQLSchema {
  const scalarSchemas = Array.from(
    CODEGEN_SCALAR_NAMES,
    (name) => `scalar ${name}`,
  );
  const stateSchemas = Object.values(specification.state).map(
    (state) => state.schema,
  );
  const operationSchemas = specification.modules.flatMap(
    (moduleSpecification) =>
      moduleSpecification.operations.flatMap((operation) =>
        operation.schema === null ? [] : [operation.schema],
      ),
  );

  try {
    const document = parse(
      [...scalarSchemas, ...stateSchemas, ...operationSchemas]
        .filter(Boolean)
        .join("\n\n"),
    );
    return buildASTSchema(document);
  } catch {
    throw compilationError(context, "the effective GraphQL schema is invalid");
  }
}

function attachmentReachableTypes(
  definitions: Map<string, GraphQLInputObjectType>,
): Set<string> {
  const reachable = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const [name, definition] of definitions) {
      if (reachable.has(name)) continue;
      const reachesAttachment = Object.values(definition.getFields()).some(
        (field) => {
          const typeName = getNamedType(field.type).name;
          return (
            typeName === ATTACHMENT_REF_TYPE ||
            (definitions.has(typeName) && reachable.has(typeName))
          );
        },
      );
      if (reachesAttachment) {
        reachable.add(name);
        changed = true;
      }
    }
  }

  return reachable;
}

function compileValuePlan(
  type: GraphQLInputType,
  objectPlans: Map<string, ObjectPlan>,
): ValuePlan {
  if (isNonNullType(type)) {
    return { ...compileValuePlan(type.ofType, objectPlans), required: true };
  }
  if (isListType(type)) {
    return {
      item: compileValuePlan(type.ofType, objectPlans),
      kind: "list",
      required: false,
    };
  }

  const typeName = type.name;
  if (typeName === ATTACHMENT_REF_TYPE) {
    return { kind: "attachment", required: false };
  }
  const body = objectPlans.get(typeName);
  if (!body) {
    throw new Error(`Internal attachment schema plan error for ${typeName}`);
  }
  return { body, kind: "object", required: false };
}

function compileRootPlan(
  rootName: string,
  definitions: Map<string, GraphQLInputObjectType>,
): ObjectPlan | null {
  const reachable = attachmentReachableTypes(definitions);
  if (!reachable.has(rootName)) return null;

  const objectPlans = new Map<string, ObjectPlan>();
  for (const name of reachable) objectPlans.set(name, { fields: [] });

  for (const name of reachable) {
    const definition = definitions.get(name);
    const body = objectPlans.get(name);
    if (!definition || !body) continue;
    for (const field of Object.values(definition.getFields())) {
      const typeName = getNamedType(field.type).name;
      if (typeName !== ATTACHMENT_REF_TYPE && !reachable.has(typeName)) {
        continue;
      }
      body.fields.push({
        hasDefault: field.defaultValue !== undefined,
        name: field.name,
        value: compileValuePlan(field.type, objectPlans),
      });
    }
  }

  return objectPlans.get(rootName) ?? null;
}

function readOwnField(
  value: Record<string, unknown>,
  fieldName: string,
  context: CompilerContext,
  path: string,
): ReadFieldResult {
  try {
    if (!Object.prototype.hasOwnProperty.call(value, fieldName)) {
      return { present: false, value: undefined };
    }
    return { present: true, value: value[fieldName] };
  } catch {
    throw extractionError(context, path, "the declared field cannot be read");
  }
}

function extractValue(
  plan: ValuePlan,
  value: unknown,
  path: string,
  context: CompilerContext,
  refs: AttachmentRef[],
  seenRefs: Set<string>,
  activeObjects: WeakSet<object>,
): void {
  if (value === null || value === undefined) {
    if (plan.required) {
      throw extractionError(
        context,
        path,
        "a required value is missing or null",
      );
    }
    return;
  }

  if (plan.kind === "attachment") {
    if (typeof value !== "string") {
      throw extractionError(context, path, "expected an AttachmentRef string");
    }
    try {
      parseRef(value as AttachmentRef);
    } catch {
      throw extractionError(context, path, "the AttachmentRef is malformed");
    }
    if (!seenRefs.has(value)) {
      seenRefs.add(value);
      refs.push(value as AttachmentRef);
    }
    return;
  }

  if (plan.kind === "list") {
    if (!Array.isArray(value)) {
      throw extractionError(context, path, "expected a list");
    }
    for (let index = 0; index < value.length; index += 1) {
      extractValue(
        plan.item,
        value[index],
        `${path}[${index}]`,
        context,
        refs,
        seenRefs,
        activeObjects,
      );
    }
    return;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw extractionError(context, path, "expected an input object");
  }
  if (activeObjects.has(value)) {
    throw extractionError(context, path, "the input value contains a cycle");
  }

  activeObjects.add(value);
  try {
    const record = value as Record<string, unknown>;
    for (const field of plan.body.fields) {
      const fieldPath = `${path}.${field.name}`;
      const result = readOwnField(record, field.name, context, fieldPath);
      if ((!result.present || result.value === undefined) && field.hasDefault) {
        continue;
      }
      extractValue(
        field.value,
        result.value,
        fieldPath,
        context,
        refs,
        seenRefs,
        activeObjects,
      );
    }
  } finally {
    activeObjects.delete(value);
  }
}

class SchemaCompiledAttachmentExtractor implements CompiledAttachmentExtractor {
  constructor(
    private readonly context: CompilerContext,
    private readonly rootPlan: ObjectPlan | null,
  ) {}

  extract(action: Action): AttachmentRef[] {
    if (action.type !== this.context.actionType) {
      throw extractionError(
        this.context,
        "input",
        "the action type does not match the compiled schema",
      );
    }
    if (!this.rootPlan) return [];
    if (
      action.input === null ||
      typeof action.input !== "object" ||
      Array.isArray(action.input)
    ) {
      throw extractionError(this.context, "input", "expected an input object");
    }

    const refs: AttachmentRef[] = [];
    const seenRefs = new Set<string>();
    const activeObjects = new WeakSet<object>();
    activeObjects.add(action.input);
    try {
      const input = action.input as Record<string, unknown>;
      for (const field of this.rootPlan.fields) {
        const path = `input.${field.name}`;
        const result = readOwnField(input, field.name, this.context, path);
        if (
          (!result.present || result.value === undefined) &&
          field.hasDefault
        ) {
          continue;
        }
        extractValue(
          field.value,
          result.value,
          path,
          this.context,
          refs,
          seenRefs,
          activeObjects,
        );
      }
    } finally {
      activeObjects.delete(action.input);
    }
    return refs;
  }
}

function compileExtractor(
  module: DocumentModelModule,
  actionType: string,
): CompiledAttachmentExtractor {
  const context: CompilerContext = {
    actionType,
    documentType: module.documentModel.global.id,
    version: module.version ?? 1,
  };
  const specification = applicableSpecification(module, context);
  const operations = parseOperations(specification, context);
  const selected = selectOperation(operations, context);
  if (selected === null || selected.operation.schema === null) {
    return new SchemaCompiledAttachmentExtractor(context, null);
  }
  const effectiveSchema = buildEffectiveSchema(specification, context);

  const operationName = selected.operation.name;
  if (operationName === null) {
    throw compilationError(context, "the operation has no name");
  }
  const rootName = `${pascalCase(operationName)}Input`;
  const definitions = new Map<string, GraphQLInputObjectType>();
  for (const type of Object.values(effectiveSchema.getTypeMap())) {
    if (isInputObjectType(type) && !type.name.startsWith("__")) {
      definitions.set(type.name, type);
    }
  }
  const rootDefinitions = selected.document?.definitions.filter(
    (definition) =>
      (definition.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ||
        definition.kind === Kind.INPUT_OBJECT_TYPE_EXTENSION) &&
      definition.name.value === rootName,
  );
  if (!rootDefinitions?.length || !definitions.has(rootName)) {
    throw compilationError(
      context,
      `the operation does not declare its expected root input "${rootName}"`,
    );
  }

  return new SchemaCompiledAttachmentExtractor(
    context,
    compileRootPlan(rootName, definitions),
  );
}

export class AttachmentSchemaCompiler implements IAttachmentSchemaCompiler {
  private readonly cache = new WeakMap<
    DocumentModelModule,
    Map<string, CompiledAttachmentExtractor>
  >();

  forModuleAction(
    module: DocumentModelModule,
    actionType: string,
  ): CompiledAttachmentExtractor {
    let moduleCache = this.cache.get(module);
    if (!moduleCache) {
      moduleCache = new Map();
      this.cache.set(module, moduleCache);
    }

    const cached = moduleCache.get(actionType);
    if (cached) return cached;

    const compiled = compileExtractor(module, actionType);
    moduleCache.set(actionType, compiled);
    return compiled;
  }
}
