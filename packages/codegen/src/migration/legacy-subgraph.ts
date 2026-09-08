import type {
  LegacySubgraphImport,
  LegacySubgraphResolverSource,
  LegacySubgraphTypeDefsSource,
} from "document-model/tooling";
import path from "path";
import {
  Node,
  Project,
  SyntaxKind,
  type ClassDeclaration,
  type Expression,
  type SourceFile,
} from "ts-morph";
import { DEFAULT_PROJECT_OPTIONS } from "../utils/ts-morph-project.js";

export type LegacySubgraphDiagnostic = {
  readonly code: `PH-MIGRATE-SUBGRAPH-${string}`;
  readonly severity: "error" | "warning";
  /** Logical path inside the legacy class, not a file offset. */
  readonly path: readonly string[];
  readonly message: string;
  readonly repair: string;
};

export type LegacySubgraphAnalysis = {
  /** Absolute path of the analyzed legacy module. */
  readonly sourcePath: string;
  readonly className: string | null;
  readonly name: string | null;
  readonly typeDefs: LegacySubgraphTypeDefsSource | null;
  readonly resolvers: LegacySubgraphResolverSource | null;
  readonly hasSubscriptions: boolean | undefined;
  /** Declared members the host never reads, dropped by the candidate. */
  readonly droppedMembers: readonly string[];
  readonly diagnostics: readonly LegacySubgraphDiagnostic[];
};

/**
 * Members the legacy scaffold emits that no host reads. `onDisconnect` and
 * `additionalContextFields` are absent from `ISubgraph` and are called nowhere
 * in the repository; they were copied from the processor scaffold, where
 * `onDisconnect` is part of the contract. Dropping an empty one is
 * behavior-preserving, so the candidate omits it and the report names it.
 */
const DEAD_MEMBERS = new Set(["onDisconnect", "additionalContextFields"]);

function error(
  code: `PH-MIGRATE-SUBGRAPH-${string}`,
  memberPath: readonly string[],
  message: string,
  repair: string,
): LegacySubgraphDiagnostic {
  return { code, severity: "error", path: memberPath, message, repair };
}

function warning(
  code: `PH-MIGRATE-SUBGRAPH-${string}`,
  memberPath: readonly string[],
  message: string,
  repair: string,
): LegacySubgraphDiagnostic {
  return { code, severity: "warning", path: memberPath, message, repair };
}

/** Strips `as T`, `satisfies T`, `<T>x` and parentheses without changing the value. */
function unwrap(expression: Expression): Expression {
  let current = expression;
  for (;;) {
    if (
      Node.isAsExpression(current) ||
      Node.isSatisfiesExpression(current) ||
      Node.isTypeAssertion(current) ||
      Node.isParenthesizedExpression(current) ||
      Node.isNonNullExpression(current)
    ) {
      current = current.getExpression();
      continue;
    }
    return current;
  }
}

function subgraphBaseExpressions(file: SourceFile): ReadonlySet<string> {
  const expressions = new Set<string>();
  for (const declaration of file.getImportDeclarations()) {
    const defaultImport = declaration.getDefaultImport();
    if (defaultImport?.getText() === "BaseSubgraph") {
      expressions.add("BaseSubgraph");
    }
    const namespaceImport = declaration.getNamespaceImport();
    if (namespaceImport) {
      expressions.add(`${namespaceImport.getText()}.BaseSubgraph`);
    }
    for (const named of declaration.getNamedImports()) {
      if (named.getNameNode().getText() !== "BaseSubgraph") continue;
      expressions.add((named.getAliasNode() ?? named.getNameNode()).getText());
    }
  }
  return expressions;
}

function findSubgraphClasses(file: SourceFile): readonly ClassDeclaration[] {
  const bases = subgraphBaseExpressions(file);
  return file.getClasses().filter((declaration) => {
    const expression = declaration.getExtends()?.getExpression();
    return expression ? bases.has(unwrap(expression).getText()) : false;
  });
}

function isEmptyObjectInitializer(
  initializer: Expression | undefined,
): boolean {
  if (!initializer) return false;
  const expression = unwrap(initializer);
  return (
    Node.isObjectLiteralExpression(expression) &&
    expression.getProperties().length === 0
  );
}

/**
 * Rewrites a TypeScript filename to the emitted specifier the repository's ESM
 * resolution expects. Legacy subgraphs already import `./schema.js` for
 * `schema.ts`; a `.ts` specifier would not resolve under NodeNext.
 */
function moduleSpecifierExtension(fileName: string): string {
  const rewrites: readonly (readonly [RegExp, string])[] = [
    [/\.mts$/, ".mjs"],
    [/\.cts$/, ".cjs"],
    [/\.tsx$/, ".js"],
    [/\.ts$/, ".js"],
  ];
  for (const [pattern, replacement] of rewrites) {
    if (pattern.test(fileName)) return fileName.replace(pattern, replacement);
  }
  return fileName;
}

/**
 * Resolves one module-level identifier to an import the candidate can repeat.
 *
 * Resolution is syntactic and confined to the analyzed file, which is what
 * makes the result mechanical. A binding that is neither imported nor exported
 * has no specifier the candidate could name, so it is reported rather than
 * approximated.
 */
function resolveBinding(
  file: SourceFile,
  identifier: string,
  memberPath: readonly string[],
  rebase: (specifier: string) => string,
):
  | { binding: LegacySubgraphImport }
  | { diagnostic: LegacySubgraphDiagnostic } {
  for (const declaration of file.getImportDeclarations()) {
    const specifier = rebase(declaration.getModuleSpecifierValue());
    if (declaration.getDefaultImport()?.getText() === identifier) {
      return {
        binding: {
          importSpecifier: specifier,
          exportName: identifier,
          kind: "default",
        },
      };
    }
    if (declaration.getNamespaceImport()?.getText() === identifier) {
      return {
        binding: {
          importSpecifier: specifier,
          exportName: identifier,
          kind: "namespace",
        },
      };
    }
    for (const named of declaration.getNamedImports()) {
      if (
        (named.getAliasNode() ?? named.getNameNode()).getText() === identifier
      ) {
        return {
          binding: {
            importSpecifier: specifier,
            exportName: named.getNameNode().getText(),
            kind: "named",
          },
        };
      }
    }
  }

  const local = file.getVariableDeclaration(identifier);
  if (local) {
    if (local.isExported()) {
      return {
        binding: {
          importSpecifier: rebase(
            `./${moduleSpecifierExtension(path.basename(file.getFilePath()))}`,
          ),
          exportName: identifier,
          kind: "named",
        },
      };
    }
    return {
      diagnostic: error(
        "PH-MIGRATE-SUBGRAPH-BINDING-NOT-EXPORTED",
        memberPath,
        `${identifier} is declared in the legacy module but not exported, so the candidate cannot import it.`,
        `Export ${identifier} from the legacy module, then rerun the migration.`,
      ),
    };
  }

  return {
    diagnostic: error(
      "PH-MIGRATE-SUBGRAPH-BINDING-UNRESOLVED",
      memberPath,
      `${identifier} does not resolve to an import or an exported module-level binding in the legacy module.`,
      `Move ${identifier} into a module-level exported binding, then rerun the migration.`,
    ),
  };
}

function classifyTypeDefs(
  file: SourceFile,
  initializer: Expression,
  rebase: (specifier: string) => string,
):
  | { source: LegacySubgraphTypeDefsSource }
  | { diagnostic: LegacySubgraphDiagnostic } {
  const expression = unwrap(initializer);

  if (Node.isIdentifier(expression)) {
    const resolved = resolveBinding(
      file,
      expression.getText(),
      ["typeDefs"],
      rebase,
    );
    return "binding" in resolved
      ? { source: { kind: "document", binding: resolved.binding } }
      : { diagnostic: resolved.diagnostic };
  }

  // `gql(schemaSource)` over an imported SDL string. The call is preserved so
  // the parse still happens once, at the same point it does today.
  if (Node.isCallExpression(expression)) {
    const callee = unwrap(expression.getExpression());
    const args = expression.getArguments();
    const argument = args[0];
    if (
      Node.isIdentifier(callee) &&
      args.length === 1 &&
      Node.isIdentifier(argument)
    ) {
      const gql = resolveBinding(file, callee.getText(), ["typeDefs"], rebase);
      const source = resolveBinding(
        file,
        argument.getText(),
        ["typeDefs"],
        rebase,
      );
      if ("diagnostic" in gql) return { diagnostic: gql.diagnostic };
      if ("diagnostic" in source) return { diagnostic: source.diagnostic };
      return {
        source: {
          kind: "gql-source",
          binding: source.binding,
          gql: gql.binding,
        },
      };
    }
  }

  // A tagged template holds the SDL inline. Interpolations make it worse still,
  // because their values are resolved in the legacy module's scope.
  if (Node.isTaggedTemplateExpression(expression)) {
    return {
      diagnostic: error(
        "PH-MIGRATE-SUBGRAPH-TYPEDEFS-INLINE",
        ["typeDefs"],
        "typeDefs is an inline tagged template, which has no module-level binding the candidate can import.",
        "Move the template into an exported module-level binding, then rerun the migration.",
      ),
    };
  }

  return {
    diagnostic: error(
      "PH-MIGRATE-SUBGRAPH-TYPEDEFS-UNSUPPORTED",
      ["typeDefs"],
      `typeDefs is a ${expression.getKindName()}, which the migration cannot reproduce without reinterpreting it.`,
      "Assign typeDefs from an exported module-level DocumentNode binding, then rerun the migration.",
    ),
  };
}

function classifyResolvers(
  file: SourceFile,
  initializer: Expression,
  rebase: (specifier: string) => string,
):
  | { source: LegacySubgraphResolverSource }
  | { diagnostic: LegacySubgraphDiagnostic } {
  const expression = unwrap(initializer);

  // `getResolvers(this)`: the argument is the instance the host already passes
  // to compatibility resolvers as `subgraph`, so the call is equivalent.
  if (Node.isCallExpression(expression)) {
    const callee = unwrap(expression.getExpression());
    const args = expression.getArguments();
    const argument = args[0];
    if (
      Node.isIdentifier(callee) &&
      args.length === 1 &&
      Node.isExpression(argument) &&
      unwrap(argument).getKind() === SyntaxKind.ThisKeyword
    ) {
      const resolved = resolveBinding(
        file,
        callee.getText(),
        ["resolvers"],
        rebase,
      );
      return "binding" in resolved
        ? { source: { kind: "factory", binding: resolved.binding } }
        : { diagnostic: resolved.diagnostic };
    }
    return {
      diagnostic: error(
        "PH-MIGRATE-SUBGRAPH-RESOLVERS-UNSUPPORTED-CALL",
        ["resolvers"],
        "resolvers is a call the migration cannot reproduce; only a single-argument factory over `this` is mechanical.",
        "Reduce the initializer to `getResolvers(this)` over an imported factory, then rerun the migration.",
      ),
    };
  }

  if (Node.isIdentifier(expression)) {
    const resolved = resolveBinding(
      file,
      expression.getText(),
      ["resolvers"],
      rebase,
    );
    return "binding" in resolved
      ? { source: { kind: "map", binding: resolved.binding } }
      : { diagnostic: resolved.diagnostic };
  }

  // An inline map closes over `this`. Rewriting those references would change
  // property access, which the specification forbids calling a verbatim move.
  if (Node.isObjectLiteralExpression(expression)) {
    return {
      diagnostic: error(
        "PH-MIGRATE-SUBGRAPH-RESOLVERS-INLINE",
        ["resolvers"],
        "resolvers is an inline object literal, which may close over instance state and has no binding to import.",
        "Move the map into an exported `getResolvers(subgraph)` factory, then rerun the migration.",
      ),
    };
  }

  return {
    diagnostic: error(
      "PH-MIGRATE-SUBGRAPH-RESOLVERS-UNSUPPORTED",
      ["resolvers"],
      `resolvers is a ${expression.getKindName()}, which the migration cannot reproduce without reinterpreting it.`,
      "Assign resolvers from an exported factory or map binding, then rerun the migration.",
    ),
  };
}

export type AnalyzeLegacySubgraphRequest = {
  /** Absolute path of the legacy subgraph module. */
  readonly sourcePath: string;
  /** Absolute directory the candidate is written to. */
  readonly candidateDirectory: string;
};

/**
 * Reads one legacy subgraph class and reports what a compatibility candidate
 * can reproduce mechanically.
 *
 * The analysis is syntactic on purpose. A type-directed resolution would follow
 * re-exports and declaration merging into modules the candidate cannot name,
 * and the specification requires the migration to reject a form rather than
 * approximate it.
 */
export function analyzeLegacySubgraph(
  request: AnalyzeLegacySubgraphRequest,
): LegacySubgraphAnalysis {
  const project = new Project({
    ...DEFAULT_PROJECT_OPTIONS,
    skipFileDependencyResolution: true,
    useInMemoryFileSystem: false,
    compilerOptions: { allowJs: true },
  });
  const file = project.addSourceFileAtPath(request.sourcePath);
  const sourceDirectory = path.dirname(request.sourcePath);

  // Relative legacy specifiers are re-anchored on the candidate directory.
  // Bare package specifiers already resolve identically from both locations.
  const rebase = (specifier: string): string => {
    if (!specifier.startsWith(".")) return specifier;
    const target = path.resolve(sourceDirectory, specifier);
    const relative = path
      .relative(request.candidateDirectory, target)
      .split(path.sep)
      .join("/");
    return relative.startsWith(".") ? relative : `./${relative}`;
  };

  const declarations = findSubgraphClasses(file);
  if (declarations.length === 0) {
    return {
      sourcePath: request.sourcePath,
      className: null,
      name: null,
      typeDefs: null,
      resolvers: null,
      hasSubscriptions: undefined,
      droppedMembers: [],
      diagnostics: [
        error(
          "PH-MIGRATE-SUBGRAPH-CLASS-NOT-FOUND",
          [],
          `No class extending BaseSubgraph was found in ${request.sourcePath}.`,
          "Point the migration at the module that declares the legacy subgraph class.",
        ),
      ],
    };
  }
  if (declarations.length > 1) {
    const names = declarations.map(
      (candidate) => candidate.getName() ?? "<anonymous>",
    );
    return {
      sourcePath: request.sourcePath,
      className: null,
      name: null,
      typeDefs: null,
      resolvers: null,
      hasSubscriptions: undefined,
      droppedMembers: [],
      diagnostics: [
        error(
          "PH-MIGRATE-SUBGRAPH-CLASS-AMBIGUOUS",
          [],
          `Multiple classes extend the imported BaseSubgraph binding: ${names.join(", ")}.`,
          "Point the migration at a module that declares exactly one legacy subgraph class.",
        ),
      ],
    };
  }
  const declaration = declarations[0]!;

  const diagnostics: LegacySubgraphDiagnostic[] = [];
  const droppedMembers: string[] = [];
  const className = declaration.getName() ?? null;
  if (className === null) {
    diagnostics.push(
      error(
        "PH-MIGRATE-SUBGRAPH-CLASS-ANONYMOUS",
        [],
        "The legacy subgraph class has no name, so the candidate cannot preserve the package export name.",
        "Name the legacy class, then rerun the migration.",
      ),
    );
  } else if (!declaration.isExported()) {
    diagnostics.push(
      error(
        "PH-MIGRATE-SUBGRAPH-CLASS-NOT-EXPORTED",
        [],
        `${className} is not exported, so it is not the class a package loader registers.`,
        `Export ${className} from the legacy module, then rerun the migration.`,
      ),
    );
  }

  if (declaration.getDecorators().length > 0) {
    diagnostics.push(
      error(
        "PH-MIGRATE-SUBGRAPH-DECORATOR-UNSUPPORTED",
        [],
        "The legacy subgraph class has a decorator, whose evaluation may change class construction or registration.",
        "Remove or manually port the class decorator before activating the code-first candidate.",
      ),
    );
  }
  if (declaration.getStaticBlocks().length > 0) {
    diagnostics.push(
      error(
        "PH-MIGRATE-SUBGRAPH-STATIC-BLOCK-UNSUPPORTED",
        [],
        "The legacy subgraph class has a static block with module-load side effects the candidate cannot reproduce.",
        "Move the static initialization into an explicit module helper and port it manually.",
      ),
    );
  }

  // A constructor performs host wiring — reading extra args, registering
  // additional context fields, building services. `defineSubgraph` constructs
  // its class from `SubgraphArgs` alone and exposes no constructor seam, so
  // this cannot be carried over without changing observable setup.
  if (declaration.getConstructors().length > 0) {
    diagnostics.push(
      error(
        "PH-MIGRATE-SUBGRAPH-CONSTRUCTOR-PRESENT",
        ["constructor"],
        "The legacy class declares a constructor, whose host wiring has no code-first equivalent.",
        "Register this subgraph through registerSubgraphInstance, or move the wiring into onSetup before migrating.",
      ),
    );
  }

  let name: string | null = null;
  let typeDefs: LegacySubgraphTypeDefsSource | null = null;
  let resolvers: LegacySubgraphResolverSource | null = null;
  let hasSubscriptions: boolean | undefined = undefined;

  for (const property of declaration.getProperties()) {
    const key = property.getName();
    const initializer = property.getInitializer();

    if (property.getDecorators().length > 0) {
      diagnostics.push(
        error(
          "PH-MIGRATE-SUBGRAPH-DECORATOR-UNSUPPORTED",
          [key],
          `${key} has a decorator whose evaluation the candidate cannot reproduce mechanically.`,
          "Remove or manually port the decorator before activating the code-first candidate.",
        ),
      );
    }
    if (property.isStatic()) {
      diagnostics.push(
        error(
          "PH-MIGRATE-SUBGRAPH-STATIC-MEMBER-UNSUPPORTED",
          [key],
          `${key} is static, but the legacy host reads subgraph values from the instance.`,
          `Move ${key} to an instance field or port the static behavior manually.`,
        ),
      );
      continue;
    }

    if (DEAD_MEMBERS.has(key)) {
      if (
        key === "additionalContextFields" &&
        isEmptyObjectInitializer(initializer)
      ) {
        droppedMembers.push(key);
        diagnostics.push(
          warning(
            "PH-MIGRATE-SUBGRAPH-MEMBER-DROPPED",
            [key],
            `${key} is empty and is read by no host, so the candidate omits it.`,
            "Confirm nothing outside the host reads this member before activation.",
          ),
        );
      } else {
        diagnostics.push(
          error(
            "PH-MIGRATE-SUBGRAPH-DEAD-MEMBER-NONEMPTY",
            [key],
            `${key} contains behavior or state, so omitting it cannot be treated as behavior-preserving.`,
            `Remove ${key} only after confirming its behavior is obsolete, or port it manually.`,
          ),
        );
      }
      continue;
    }

    if (key === "name") {
      const literal = initializer ? unwrap(initializer) : undefined;
      if (literal && Node.isStringLiteral(literal)) {
        name = literal.getLiteralValue();
      } else {
        diagnostics.push(
          error(
            "PH-MIGRATE-SUBGRAPH-NAME-NOT-LITERAL",
            ["name"],
            "name is not a string literal, so the candidate cannot preserve the route segment exactly.",
            "Assign name a string literal, then rerun the migration.",
          ),
        );
      }
      continue;
    }

    if (key === "hasSubscriptions") {
      const literal = initializer ? unwrap(initializer) : undefined;
      if (literal?.getKind() === SyntaxKind.TrueKeyword) {
        hasSubscriptions = true;
      } else if (literal?.getKind() === SyntaxKind.FalseKeyword) {
        hasSubscriptions = false;
      } else {
        // Guessing here would silently add or remove a WebSocket or SSE route.
        diagnostics.push(
          error(
            "PH-MIGRATE-SUBGRAPH-SUBSCRIPTIONS-NOT-LITERAL",
            ["hasSubscriptions"],
            "hasSubscriptions is not a boolean literal, so its exact transport exposure cannot be preserved.",
            "Assign hasSubscriptions a boolean literal, then rerun the migration.",
          ),
        );
      }
      continue;
    }

    if (key === "typeDefs") {
      if (!initializer) {
        diagnostics.push(
          error(
            "PH-MIGRATE-SUBGRAPH-TYPEDEFS-MISSING",
            ["typeDefs"],
            "typeDefs is declared without an initializer, so the legacy schema is assigned elsewhere.",
            "Initialize typeDefs from an exported module-level binding, then rerun the migration.",
          ),
        );
        continue;
      }
      const classified = classifyTypeDefs(file, initializer, rebase);
      if ("source" in classified) typeDefs = classified.source;
      else diagnostics.push(classified.diagnostic);
      continue;
    }

    if (key === "resolvers") {
      if (!initializer) {
        diagnostics.push(
          error(
            "PH-MIGRATE-SUBGRAPH-RESOLVERS-MISSING",
            ["resolvers"],
            "resolvers is declared without an initializer, so the legacy map is assigned elsewhere.",
            "Initialize resolvers from an exported factory or map binding, then rerun the migration.",
          ),
        );
        continue;
      }
      const classified = classifyResolvers(file, initializer, rebase);
      if ("source" in classified) resolvers = classified.source;
      else diagnostics.push(classified.diagnostic);
      continue;
    }

    // Any other instance field is state the compatibility config cannot hold.
    diagnostics.push(
      error(
        "PH-MIGRATE-SUBGRAPH-MEMBER-UNSUPPORTED",
        [key],
        `${key} is instance state that the code-first declaration cannot carry.`,
        `Move ${key} out of the subgraph class, or register this subgraph through registerSubgraphInstance.`,
      ),
    );
  }

  for (const accessor of [
    ...declaration.getGetAccessors(),
    ...declaration.getSetAccessors(),
  ]) {
    const key = accessor.getName();
    if (accessor.getDecorators().length > 0) {
      diagnostics.push(
        error(
          "PH-MIGRATE-SUBGRAPH-DECORATOR-UNSUPPORTED",
          [key],
          `${key} has a decorator whose evaluation the candidate cannot reproduce mechanically.`,
          "Remove or manually port the decorator before activating the code-first candidate.",
        ),
      );
    }
    if (accessor.isStatic()) {
      diagnostics.push(
        error(
          "PH-MIGRATE-SUBGRAPH-STATIC-MEMBER-UNSUPPORTED",
          [key],
          `${key} is static, but the legacy host reads subgraph values from the instance.`,
          `Move ${key} to an instance accessor or port the static behavior manually.`,
        ),
      );
      continue;
    }
    diagnostics.push(
      error(
        "PH-MIGRATE-SUBGRAPH-ACCESSOR-UNSUPPORTED",
        [key],
        `${key} is declared as an accessor, whose value is computed per read against the legacy instance.`,
        `Assign ${key} from an exported module-level binding, then rerun the migration.`,
      ),
    );
  }

  for (const method of declaration.getMethods()) {
    const key = method.getName();
    const empty =
      (method.getBody()?.getText() ?? "{}").replace(/\s|[{}]/g, "") === "";
    if (method.getDecorators().length > 0) {
      diagnostics.push(
        error(
          "PH-MIGRATE-SUBGRAPH-DECORATOR-UNSUPPORTED",
          [key],
          `${key} has a decorator whose evaluation the candidate cannot reproduce mechanically.`,
          "Remove or manually port the decorator before activating the code-first candidate.",
        ),
      );
    }
    if (method.isStatic()) {
      diagnostics.push(
        error(
          "PH-MIGRATE-SUBGRAPH-STATIC-MEMBER-UNSUPPORTED",
          [key],
          `${key} is static, but the legacy host invokes subgraph methods on the instance.`,
          `Move ${key} to an instance method or port the static behavior manually.`,
        ),
      );
      continue;
    }
    if (DEAD_MEMBERS.has(key)) {
      if (empty) {
        droppedMembers.push(key);
        diagnostics.push(
          warning(
            "PH-MIGRATE-SUBGRAPH-MEMBER-DROPPED",
            [key],
            `${key} is empty and is called by no host, so the candidate omits it.`,
            "Confirm nothing outside the host calls this method before activation.",
          ),
        );
      } else {
        diagnostics.push(
          error(
            "PH-MIGRATE-SUBGRAPH-DEAD-MEMBER-NONEMPTY",
            [key],
            `${key} contains behavior, so omitting it cannot be treated as behavior-preserving.`,
            `Remove ${key} only after confirming its behavior is obsolete, or port it manually.`,
          ),
        );
      }
      continue;
    }

    if (key === "onSetup") {
      if (empty) {
        droppedMembers.push(key);
        diagnostics.push(
          warning(
            "PH-MIGRATE-SUBGRAPH-ONSETUP-EMPTY",
            ["onSetup"],
            "onSetup has an empty body, so the candidate omits it rather than declaring a no-op.",
            "No action required.",
          ),
        );
      } else {
        // The body reads `this`. Rebinding it to the `subgraph` parameter
        // changes property access, so it is not a verbatim move.
        diagnostics.push(
          error(
            "PH-MIGRATE-SUBGRAPH-ONSETUP-BODY",
            ["onSetup"],
            "onSetup has a body that resolves against the legacy instance, which the migration will not rewrite.",
            "Port onSetup by hand to `onSetup({ subgraph })` after the schema migration is verified.",
          ),
        );
      }
      continue;
    }

    diagnostics.push(
      error(
        "PH-MIGRATE-SUBGRAPH-METHOD-UNSUPPORTED",
        [key],
        `${key} is a legacy class method with no code-first declaration equivalent.`,
        `Move ${key} into the resolver factory or a helper module, then rerun the migration.`,
      ),
    );
  }

  if (name === null && !diagnostics.some(({ path: at }) => at[0] === "name")) {
    diagnostics.push(
      error(
        "PH-MIGRATE-SUBGRAPH-NAME-MISSING",
        ["name"],
        "The legacy class declares no name, so the candidate has no route segment to preserve.",
        "Declare a string literal name on the legacy class, then rerun the migration.",
      ),
    );
  }
  if (
    typeDefs === null &&
    !diagnostics.some(({ path: at }) => at[0] === "typeDefs")
  ) {
    diagnostics.push(
      error(
        "PH-MIGRATE-SUBGRAPH-TYPEDEFS-MISSING",
        ["typeDefs"],
        "The legacy class declares no typeDefs.",
        "Declare typeDefs on the legacy class, then rerun the migration.",
      ),
    );
  }
  if (
    resolvers === null &&
    !diagnostics.some(({ path: at }) => at[0] === "resolvers")
  ) {
    diagnostics.push(
      error(
        "PH-MIGRATE-SUBGRAPH-RESOLVERS-MISSING",
        ["resolvers"],
        "The legacy class declares no resolvers.",
        "Declare resolvers on the legacy class, then rerun the migration.",
      ),
    );
  }

  return {
    sourcePath: request.sourcePath,
    className,
    name,
    typeDefs,
    resolvers,
    hasSubscriptions,
    droppedMembers,
    diagnostics,
  };
}
