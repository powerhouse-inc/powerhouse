/** Writing a version's module files: each operation with the body of its schema-first reducer. */
import { camelCase, pascalCase } from "change-case";
import { Kind } from "graphql";
import type { Project } from "ts-morph";
import {
  type ObjectLiteralExpression,
  type ImportSpecifier,
  Node,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import {
  callFrameOwner,
  freeName,
  importBindings,
  stableArrow,
  variableNames,
} from "../migration-ast.js";
import {
  checkMovedSource,
  GENERATED_HEADER,
  type Input,
  isPropertyName,
  literal,
  type ModulePlan,
  refuse,
  sourceFile,
  unwrapExpression,
  type VersionContext,
} from "./context.js";
import { typeDeclarations } from "./definition.js";
import { rebaseText, resolveSpecifier } from "./imports.js";
import { referencedTypes, type StoredOperation } from "./stored-model.js";

/**
 * Every name a reducer file declares or uses, globals such as Error included,
 * which a name the module file adds at the top level must not shadow.
 */
function usedNames(file: SourceFile): Set<string> {
  const names = topLevelNames(file);
  for (const identifier of file.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (!isPropertyName(identifier)) names.add(identifier.getText());
  }
  return names;
}

/** Names a module file's moved inputs need besides their own. */
const INPUT_FILE_NAMES = ["ph", "InputDescriptor"];

/**
 * Finds the input types only one module's operations use, which that module
 * declares instead of the definition. Enums stay in the definition, as does an
 * input whose name the module's reducer code already uses and every input it
 * names.
 */
export function planInputHomes(
  context: VersionContext,
  plans: readonly ModulePlan[],
) {
  const { types } = context;
  const isInput = (name: string) =>
    types.get(name)?.node.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION;
  const closure = (root: string) => {
    const seen = new Set<string>();
    const walk = (name: string) => {
      if (seen.has(name) || !types.has(name)) return;
      seen.add(name);
      for (const used of referencedTypes(types.get(name)!.node, types)) {
        walk(used);
      }
    };
    walk(root);
    return seen;
  };
  const users = new Map<string, Set<ModulePlan>>();
  for (const plan of plans) {
    for (const operation of plan.stored.operations) {
      const root = `${pascalCase(camelCase(operation.name))}Input`;
      for (const name of closure(root)) {
        if (!isInput(name)) continue;
        users.set(name, (users.get(name) ?? new Set()).add(plan));
      }
    }
  }
  const taken = new Map(
    plans.map((plan) => [
      plan,
      plan.reducerFile === undefined
        ? new Set<string>()
        : usedNames(
            sourceFile(context.project, context.input, plan.reducerFile),
          ),
    ]),
  );
  const homes = new Map<string, ModulePlan>();
  for (const [name, used] of users) {
    if (used.size !== 1) continue;
    const [plan] = used;
    const names = taken.get(plan)!;
    if (
      name === "Reflect" ||
      names.has(name) ||
      INPUT_FILE_NAMES.some((other) => names.has(other))
    ) {
      continue;
    }
    homes.set(name, plan);
  }
  // The definition cannot name a module's input, so what it keeps keeps its inputs.
  for (let changed = true; changed;) {
    changed = false;
    for (const name of types.keys()) {
      if (homes.has(name)) continue;
      for (const used of referencedTypes(types.get(name)!.node, types)) {
        if (homes.delete(used)) changed = true;
      }
    }
  }
  for (const [name, plan] of homes) context.inputHomes.set(name, plan);
}

/** The `export const <name> = { ... }` operations object of a reducer file. */
export function operationsObject(file: SourceFile, binding: string) {
  for (const statement of file.getVariableStatements()) {
    if (!statement.hasExportKeyword()) continue;
    for (const declaration of statement.getDeclarations()) {
      if (declaration.getName() !== binding) continue;
      const initializer = declaration.getInitializer();
      if (initializer === undefined) continue;
      const value = unwrapExpression(initializer);
      if (!Node.isObjectLiteralExpression(value)) continue;
      return { statement, declaration, object: value };
    }
  }
  return undefined;
}

/** Identifiers the file's top level declares, imports included. */
export function topLevelNames(file: SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of file.getStatements()) {
    if (Node.isImportDeclaration(statement)) {
      for (const { local } of importBindings(statement)) {
        names.add(local.getText());
      }
    } else if (Node.isVariableStatement(statement)) {
      for (const declaration of statement.getDeclarations()) {
        for (const name of variableNames(declaration)) names.add(name);
      }
    } else if (
      Node.isFunctionDeclaration(statement) ||
      Node.isClassDeclaration(statement) ||
      Node.isInterfaceDeclaration(statement) ||
      Node.isTypeAliasDeclaration(statement) ||
      Node.isEnumDeclaration(statement)
    ) {
      const name = statement.getName();
      if (name !== undefined) names.add(name);
    }
  }
  return names;
}

export type OperationReducer = {
  readonly leading: string;
  readonly text: string;
  /** The reducer function the operation calls by name, its action cast. */
  readonly referenced?: string;
};

/** The errorCode the generated class of `name` reported, if it says. */
export function generatedErrorCode(
  context: VersionContext,
  name: string,
): string | undefined {
  for (const path of context.input.files.keys()) {
    if (
      !path.startsWith(`${context.dir}/gen/`) ||
      !path.endsWith("/error.ts")
    ) {
      continue;
    }
    const property = sourceFile(context.project, context.input, path)
      .getClass(name)
      ?.getProperty("errorCode");
    const initializer = property?.getInitializer();
    const value =
      initializer === undefined ? undefined : unwrapExpression(initializer);
    if (value !== undefined && Node.isStringLiteral(value)) {
      return value.getLiteralValue();
    }
  }
  return undefined;
}

/**
 * Whether the class an operation's context passes for `name` reports the
 * errorCode its generated class reported. Otherwise the generated class stays.
 */
export function sameErrorCode(context: VersionContext, name: string): boolean {
  const stored = context.specification.modules
    .flatMap((module) => module.operations)
    .flatMap((operation) => operation.errors ?? [])
    .find((error) => error.name === name);
  if (stored === undefined) return false;
  const next = stored.code ? stored.code : pascalCase(name);
  return generatedErrorCode(context, name) === next;
}

/** The function an operation property holds, when it holds one inline. */
export function operationFunction(
  object: ObjectLiteralExpression,
  methodName: string,
): Node | undefined {
  const property = object.getProperty(methodName);
  if (property === undefined) return undefined;
  if (Node.isMethodDeclaration(property)) return property;
  if (!Node.isPropertyAssignment(property)) return undefined;
  const initializer = unwrapExpression(property.getInitializerOrThrow());
  return Node.isArrowFunction(initializer) ||
    Node.isFunctionExpression(initializer)
    ? initializer
    : undefined;
}

/**
 * The error classes a reducer file imports from the generated error files,
 * and which of them its operations' contexts can provide: every use is in
 * the reducer of an operation that declares the error. The others stay
 * classes in errors.ts.
 */
export function contextErrors(
  context: VersionContext,
  reducer: SourceFile,
  reducerPath: string,
  object: ObjectLiteralExpression,
  operations: readonly StoredOperation[],
): {
  readonly byOperation: ReadonlyMap<string, readonly string[]>;
  readonly imported: ReadonlySet<string>;
} {
  const imported = new Map<string, ImportSpecifier>();
  for (const declaration of reducer.getImportDeclarations()) {
    const target = resolveSpecifier(
      context.input.files,
      context.input,
      reducerPath,
      declaration.getModuleSpecifierValue(),
    );
    if (target === undefined || !/\/gen\/[^/]+\/error\.ts$/.test(target)) {
      continue;
    }
    for (const named of declaration.getNamedImports()) {
      if (named.getAliasNode() !== undefined) continue;
      imported.set(named.getName(), named);
    }
  }
  const functions = new Map<Node, StoredOperation>();
  for (const operation of operations) {
    const fn = operationFunction(
      object,
      `${camelCase(operation.name)}Operation`,
    );
    if (fn !== undefined) functions.set(fn, operation);
  }
  const byOperation = new Map<string, string[]>();
  const bound = new Set<string>();
  for (const name of imported.keys()) {
    const owners = reducer
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter(
        (identifier) =>
          identifier.getText() === name &&
          identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) ===
            undefined &&
          !isPropertyName(identifier),
      )
      .map((identifier) =>
        identifier.getFirstAncestor((node) => functions.has(node)),
      );
    const declaredByOwner = owners.every(
      (owner) =>
        owner !== undefined &&
        (functions.get(owner)!.errors ?? []).some(
          (error) => error.name === name,
        ),
    );
    // Another file imports the class, or the context's class would report
    // another errorCode: the reducer keeps throwing the class it threw.
    if (
      !declaredByOwner ||
      owners.length === 0 ||
      context.errorsNeeded.has(name) ||
      !sameErrorCode(context, name)
    ) {
      context.errorsNeeded.add(name);
      continue;
    }
    bound.add(name);
    for (const owner of new Set(owners)) {
      const key = camelCase(functions.get(owner!)!.name);
      byOperation.set(key, [...(byOperation.get(key) ?? []), name]);
    }
  }
  // The context provides these now, so the file no longer imports them.
  for (const name of bound) {
    const specifier = imported.get(name)!;
    const declaration = specifier.getFirstAncestorByKindOrThrow(
      SyntaxKind.ImportDeclaration,
    );
    specifier.remove();
    if (
      declaration.getNamedImports().length === 0 &&
      declaration.getDefaultImport() === undefined &&
      declaration.getNamespaceImport() === undefined
    ) {
      declaration.remove();
    }
  }
  return { byOperation, imported: bound };
}

/**
 * A reducer defined elsewhere and named by the operations object. It takes the
 * schema-first signature, which may declare fewer than the three arguments
 * the generated reducer supplies. Reflect.apply keeps that invocation intact.
 */
function referencedReducer(
  path: string,
  leading: string,
  reference: Node,
): OperationReducer {
  const name = reference.getText();
  if (!stableArrow(reference)) {
    refuse(
      path,
      reference.getStartLineNumber(),
      `${name} is not an immutable arrow reference, so its receiver or selected function could change when the operations object is replaced.`,
      "Use a const arrow helper that captures its dependencies explicitly, or keep this model schema-first.",
    );
  }
  if (reference.getSourceFile().getLocal("Reflect") !== undefined) {
    refuse(
      path,
      reference.getStartLineNumber(),
      `${name} needs Reflect.apply to keep its schema-first call, but this file declares Reflect.`,
      "Rename the local Reflect binding before migrating this model.",
    );
  }
  const taken = new Set([name]);
  const state = freeName(taken, "state");
  taken.add(state);
  const input = freeName(taken, "_input");
  taken.add(input);
  const context = freeName(taken, "context");
  return {
    leading,
    text: `// ph migrate: ${name} keeps its schema-first signature and all three arguments.\nreduce: (${state}, ${input}, ${context}) => Reflect.apply(${name}, undefined, [${state}, ${context}.action, ${context}.dispatch])`,
    referenced: name,
  };
}

/** The original reducer of `method`, spelled as the operation's `reduce`. */
export function operationReducer(
  path: string,
  object: ObjectLiteralExpression,
  operationsName: string,
  methodName: string,
  errorNames: readonly string[],
): OperationReducer {
  const property = object.getProperty(methodName);
  if (property === undefined) {
    refuse(
      path,
      object.getStartLineNumber(),
      `${operationsName} has no ${methodName}, so this operation has no reducer to keep.`,
      `Add ${methodName} to ${operationsName}, or run ph generate to scaffold it, then migrate again.`,
    );
  }
  const leading = property
    .getLeadingCommentRanges()
    .map((range) => range.getText())
    .join("\n");
  let fn: Node | undefined;
  if (Node.isMethodDeclaration(property)) fn = property;
  else if (Node.isPropertyAssignment(property)) {
    const initializer = unwrapExpression(property.getInitializerOrThrow());
    if (
      Node.isArrowFunction(initializer) ||
      Node.isFunctionExpression(initializer)
    ) {
      fn = initializer;
    } else if (Node.isIdentifier(initializer)) {
      return referencedReducer(path, leading, initializer);
    }
  } else if (Node.isShorthandPropertyAssignment(property)) {
    return referencedReducer(path, leading, property.getNameNode());
  }
  if (
    fn === undefined ||
    !(
      Node.isMethodDeclaration(fn) ||
      Node.isArrowFunction(fn) ||
      Node.isFunctionExpression(fn)
    )
  ) {
    refuse(
      path,
      property.getStartLineNumber(),
      `${operationsName}.${methodName} is neither a method nor a function, so its reducer cannot be read.`,
      `Write ${methodName} as a method of ${operationsName}.`,
    );
  }
  if (fn.isAsync() || ("isGenerator" in fn && fn.isGenerator())) {
    refuse(
      path,
      fn.getStartLineNumber(),
      `${operationsName}.${methodName} is async or a generator, and a reducer changes the state synchronously.`,
      `Make ${methodName} a plain synchronous function.`,
    );
  }
  const body = fn.getBody();
  if (body === undefined) {
    refuse(
      path,
      fn.getStartLineNumber(),
      `${operationsName}.${methodName} has no body.`,
      `Give ${methodName} a body.`,
    );
  }
  if (Node.isFunctionExpression(fn) && fn.getName() !== undefined) {
    refuse(
      path,
      fn.getStartLineNumber(),
      `${operationsName}.${methodName} is a named function expression, whose local function binding would be lost.`,
      "Call the function from a const arrow helper and reference that helper from the operations object.",
    );
  }
  const readsEnclosingFrame = (node: Node) => {
    const owner = callFrameOwner(node);
    return (
      owner === fn ||
      (Node.isArrowFunction(fn) && !owner?.getAncestors().includes(fn))
    );
  };
  const ownArguments = fn
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .find(
      (node) =>
        node.getText() === "arguments" &&
        !isPropertyName(node) &&
        readsEnclosingFrame(node),
    );
  if (ownArguments !== undefined) {
    refuse(
      path,
      ownArguments.getStartLineNumber(),
      `${operationsName}.${methodName} reads arguments, whose values change in a code-first reducer.`,
      "Use the named state, action and dispatch parameters instead of arguments.",
    );
  }
  const ownThis = fn
    .getDescendantsOfKind(SyntaxKind.ThisKeyword)
    .find((node) => readsEnclosingFrame(node));
  if (ownThis !== undefined) {
    refuse(
      path,
      ownThis.getStartLineNumber(),
      `${operationsName}.${methodName} uses this, which means ${operationsName} only while the generated reducer calls it.`,
      `Call a shared helper function instead of this.${ownThis
        .getParentOrThrow()
        .getText()
        .replace(/^this\./, "")}.`,
    );
  }
  const params = fn.getParameters();
  if (params.length > 3 || params.some((param) => param.getName() === "this")) {
    refuse(
      path,
      fn.getStartLineNumber(),
      `${operationsName}.${methodName} declares parameters beyond state, action and dispatch.`,
      "Move the additional bindings into the reducer body, or declare a separate helper function.",
    );
  }
  for (const param of params) {
    if (param.isRestParameter()) {
      refuse(
        path,
        param.getStartLineNumber(),
        `${operationsName}.${methodName} takes a rest parameter.`,
        "Name the state, action and dispatch parameters.",
      );
    }
  }
  const binding = (index: number) => {
    const param = params.at(index);
    if (param === undefined) return undefined;
    const initializer = param.getInitializer();
    return `${param.getNameNode().getText()}${initializer === undefined ? "" : ` = ${initializer.getText()}`}`;
  };
  const stateParam = binding(0) ?? "_state";
  const action = binding(1);
  const dispatch = binding(2);
  const context = [
    action !== undefined &&
      (action === "action" ? "action" : `action: ${action}`),
    dispatch !== undefined &&
      (dispatch === "dispatch" ? "dispatch" : `dispatch: ${dispatch}`),
    errorNames.length > 0 && `errors: { ${errorNames.join(", ")} }`,
  ].filter(Boolean);
  const bodyText = Node.isBlock(body)
    ? body.getText()
    : `{\n${body.getText()};\n}`;
  const inputName = freeName(
    new Set(
      fn
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .map((identifier) => identifier.getText()),
    ),
    "_input",
  );
  return {
    leading,
    text: `reduce(${stateParam}, ${inputName}${context.length === 0 ? "" : `, { ${context.join(", ")} }`}) ${bodyText}`,
  };
}

/** A module file, and the helper names it took over from its reducer file. */
export function moduleFileText(
  context: VersionContext,
  plan: ModulePlan,
): { readonly text: string; readonly helpers: ReadonlyMap<string, string> } {
  const { input, project, modelCamel, specification } = context;
  const reducer =
    plan.reducerFile === undefined
      ? undefined
      : sourceFile(project, input, plan.reducerFile);
  if (reducer !== undefined && plan.reducerFile !== undefined) {
    checkMovedSource(reducer, plan.reducerFile);
  }
  const found =
    reducer === undefined
      ? undefined
      : operationsObject(
          reducer,
          `${context.modelCamel}${plan.pascal}Operations`,
        );
  // The reducer file, its path and its operations object, which exist together.
  const source =
    reducer === undefined ||
    found === undefined ||
    plan.reducerFile === undefined
      ? undefined
      : { file: reducer, path: plan.reducerFile, ...found };
  if (plan.stored.operations.length > 0 && source === undefined) {
    refuse(
      plan.reducerFile ?? `${context.dir}/src/reducers`,
      undefined,
      `No directly exported reducer object for the ${plan.stored.name} module was found.`,
      "Declare the operations object directly with export const, or run ph generate to restore its scaffold, then migrate again.",
    );
  }
  const taken = reducer === undefined ? new Set<string>() : usedNames(reducer);
  taken.add("Reflect");
  const inputs = new Set(
    [...context.inputHomes]
      .filter(([, home]) => home === plan)
      .map(([name]) => name),
  );
  for (const name of inputs) taken.add(name);
  if (source !== undefined) {
    const expected = new Set(
      plan.stored.operations.map(
        (operation) => `${camelCase(operation.name)}Operation`,
      ),
    );
    const seen = new Set<string>();
    for (const property of source.object.getProperties()) {
      const name =
        Node.isPropertyAssignment(property) ||
        Node.isMethodDeclaration(property) ||
        Node.isShorthandPropertyAssignment(property)
          ? property.getNameNode()
          : undefined;
      const key =
        name !== undefined && Node.isIdentifier(name)
          ? name.getText()
          : name !== undefined && Node.isStringLiteral(name)
            ? name.getLiteralValue()
            : undefined;
      if (key === undefined || !expected.has(key) || seen.has(key)) {
        refuse(
          source.path,
          property.getStartLineNumber(),
          `${source.declaration.getName()} contains a spread, computed, extra, accessor or duplicate member whose behavior cannot be preserved when replacing the operations object.`,
          "Keep exactly one plain member for each stored operation and move other initialization into separate declarations before migrating.",
        );
      }
      seen.add(key);
    }
    const operationsName = source.declaration.getName();
    const selfUse = source.file
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .find(
        (identifier) =>
          identifier.getText() === operationsName &&
          identifier !== source.declaration.getNameNode() &&
          identifier.getFirstAncestorByKind(SyntaxKind.ExportDeclaration) ===
            undefined,
      );
    if (selfUse !== undefined) {
      refuse(
        source.path,
        selfUse.getStartLineNumber(),
        `The reducer file calls ${operationsName} itself, which a code-first module does not export.`,
        "Move the shared logic into a helper function and call that from each reducer.",
      );
    }
  }
  const boundErrors =
    source === undefined
      ? undefined
      : contextErrors(
          context,
          source.file,
          source.path,
          source.object,
          plan.stored.operations,
        );
  const moduleConst = freeName(taken, plan.constName);
  const scopes = freeName(taken, "scopes");
  taken.add(moduleConst).add(scopes);
  /** What the module imports from the definition: name → local name. */
  const imported = new Map<string, string>();
  const fromDefinition = (name: string) => {
    let local = imported.get(name);
    if (local === undefined) {
      local = freeName(taken, name);
      taken.add(local);
      imported.set(name, local);
    }
    return local;
  };
  const operationEntries = (from: NonNullable<typeof source>) =>
    plan.stored.operations.map((operation) => {
      const key = camelCase(operation.name);
      const methodName = `${key}Operation`;
      const reduce = operationReducer(
        from.path,
        from.object,
        from.declaration.getName(),
        methodName,
        boundErrors?.byOperation.get(key) ?? [],
      );
      if (reduce.referenced !== undefined) {
        context.notes.push(
          `Version ${context.version}: the ${operation.name} reducer calls ${reduce.referenced} through Reflect.apply, preserving its schema-first signature and all three arguments.`,
        );
      }
      const errors = (operation.errors ?? []).map((error) => {
        if (error.name.trim() === "") {
          refuse(
            context.specFile,
            undefined,
            `An error of ${operation.name} in version ${specification.version} has no name.`,
            "Name the error in the document model editor, then migrate again.",
          );
        }
        const entries = [
          error.code !== undefined &&
            error.code !== null &&
            error.code !== "" &&
            `code: ${literal(error.code)}`,
          typeof error.description === "string" &&
            error.description !== "" &&
            `description: ${literal(error.description)}`,
          typeof error.template === "string" &&
            error.template !== "" &&
            `template: ${literal(error.template)}`,
        ].filter(Boolean);
        return `${literal(error.name)}: { ${entries.join(", ")} }`;
      });
      const examples = (operation.examples ?? []).map(
        (example) =>
          `{ key: ${literal(example.id)}, value: ${literal(example.value)} }`,
      );
      const entries = [
        typeof operation.description === "string" &&
          operation.description !== "" &&
          `description: ${literal(operation.description)}`,
        `input: ${inputs.has(`${pascalCase(key)}Input`) ? `${pascalCase(key)}Input` : fromDefinition(`${pascalCase(key)}Input`)}`,
        errors.length > 0 && `errors: { ${errors.join(", ")} }`,
        examples.length > 0 && `examples: [${examples.join(", ")}]`,
        reduce.text,
      ].filter(Boolean);
      const scope = operation.scope === "local" ? "local" : "global";
      return `${reduce.leading === "" ? "" : `${reduce.leading}\n`}${key}: ${scopes}.${scope}({\n${entries.join(",\n")},\n})`;
    });
  // A module with operations has a source; one without has nothing to reduce.
  const operations = source === undefined ? [] : operationEntries(source);
  const declaration = `export const ${moduleConst} = ${fromDefinition(`${modelCamel}Model`)}.module(${literal(plan.key)}, {\n${
    typeof plan.stored.description === "string" &&
    plan.stored.description !== ""
      ? `description: ${literal(plan.stored.description)},\n`
      : ""
  }operations: (${scopes}) => ({\n${operations.join(",\n")}\n}),\n});`;

  const header = `/**\n * The ${context.model.name} ${plan.stored.name} operations of version ${context.version}: their inputs,\n * errors and reducers. Migrated from the schema-first reducers by ph migrate.\n */`;
  const imports: string[] = [];
  const body: string[] = [];
  /** Names the reducer file exported besides its reducers, which now live in the module file. */
  const helpers = new Map<string, string>();
  if (reducer !== undefined) {
    for (const statement of reducer.getStatements()) {
      if (Node.isImportDeclaration(statement)) {
        imports.push(statement.getText());
        continue;
      }
      if (found !== undefined && statement === found.statement) {
        const modifiers = found.statement
          .getModifiers()
          .map((node) => node.getText());
        const prefix = [
          ...modifiers,
          found.statement.getDeclarationKind(),
        ].join(" ");
        for (const sibling of found.statement.getDeclarations()) {
          if (sibling === found.declaration) {
            body.push(declaration);
          } else {
            body.push(`${prefix} ${sibling.getText()};`);
            if (found.statement.isExported()) {
              const name = sibling.getNameNode();
              const bound = Node.isIdentifier(name)
                ? [name]
                : name
                    .getDescendantsOfKind(SyntaxKind.BindingElement)
                    .map((element) => element.getNameNode())
                    .filter(Node.isIdentifier);
              for (const identifier of bound) {
                helpers.set(identifier.getText(), plan.path);
              }
            }
          }
        }
        continue;
      }
      body.push(statement.getFullText().replace(GENERATED_HEADER, "").trim());
      for (const name of exportedNamesOfStatement(statement)) {
        helpers.set(name, plan.path);
      }
    }
  }
  if (found === undefined) body.push(declaration);
  // The inputs come before the reducer code, which may use them as it loads.
  const declared =
    inputs.size === 0
      ? undefined
      : typeDeclarations(context.types, {
          only: inputs,
          reference: fromDefinition,
        });
  const moved = [...imports, declared?.text, ...body]
    .filter((part) => part !== undefined)
    .join("\n\n");
  const documentModel =
    declared === undefined
      ? ""
      : `import { ${["ph", ...[...declared.annotations].sort().map((name) => `type ${name}`)].join(", ")} } from "document-model";\n`;
  const definitionImports = [...imported]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, local]) => (name === local ? name : `${name} as ${local}`));
  const text = `${header}\n${documentModel}import { ${definitionImports.join(", ")} } from "../definition.js";\n\n${
    plan.reducerFile === undefined
      ? moved
      : rebaseText(moved, plan.reducerFile, plan.path)
  }\n`;
  return { text, helpers };
}

export function exportedNamesOfStatement(statement: Node): string[] {
  if (
    (Node.isFunctionDeclaration(statement) ||
      Node.isClassDeclaration(statement) ||
      Node.isInterfaceDeclaration(statement) ||
      Node.isTypeAliasDeclaration(statement) ||
      Node.isEnumDeclaration(statement)) &&
    statement.isExported()
  ) {
    const name = statement.getName();
    return name === undefined ? [] : [name];
  }
  if (Node.isVariableStatement(statement) && statement.isExported()) {
    return statement
      .getDeclarations()
      .flatMap((declaration) =>
        Node.isIdentifier(declaration.getNameNode())
          ? [declaration.getName()]
          : [],
      );
  }
  return [];
}

/** Imports of the generated reducer: binding name → reducer file. */
export function reducerFiles(project: Project, input: Input, dir: string) {
  const path = `${dir}/gen/reducer.ts`;
  const map = new Map<string, string>();
  if (!input.files.has(path)) return map;
  const file = sourceFile(project, input, path);
  for (const declaration of file.getImportDeclarations()) {
    const target = resolveSpecifier(
      input.files,
      input,
      path,
      declaration.getModuleSpecifierValue(),
    );
    if (target === undefined || !target.includes("/src/reducers/")) continue;
    for (const named of declaration.getNamedImports()) {
      map.set(named.getName(), target);
    }
  }
  return map;
}
