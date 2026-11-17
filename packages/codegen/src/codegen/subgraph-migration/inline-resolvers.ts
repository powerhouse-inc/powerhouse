/** Turns the schema-first resolver map into members of the subgraph class. */
import {
  type ClassDeclaration,
  Node,
  type Project,
  type PropertyDeclaration,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import { importBindings } from "../migration-ast.js";
import { type Input, lineOf, refuse } from "./context.js";
import {
  declarationMembers,
  declarationTargets,
  factoryDeclarations,
  factoryReferences,
  instanceDeclarations,
  instanceThisOwners,
  type ParamField,
  parameterOf,
  rewrittenText,
  takenNames,
  type TextOf,
  retainedDeclarations,
} from "./factory-declarations.js";
import { type FactoryFilePlan, planFactoryFile } from "./factory-file.js";
import { type ResolverFactory, resolverFactory } from "./resolver-factory.js";
import { type ResolverCall, resolverMembers } from "./resolver-members.js";
import {
  addNamedImports,
  importReferences,
  localBindings,
  topLevelNames,
} from "./source-imports.js";

export type InlinedResolvers = {
  /**
   * Each resolver by coordinate: `Query.builders`,
   * `SOW_Progress.__resolveType`, `Subscription.onTick.subscribe`.
   */
  readonly calls: ReadonlyMap<string, ResolverCall>;
  /** The first method the resolvers became, which `getSchema` goes before. */
  readonly firstMethod: string | undefined;
  /** What the developer should know about the conversion. */
  readonly notes: readonly string[];
  /** The file the resolver factory came from, when it is not index.ts. */
  readonly factoryFile?: {
    readonly path: string;
    readonly before: string;
    readonly after: string | null;
  };
};

/**
 * Turns the schema-first resolver map into members of the subgraph class:
 * each resolver becomes a private method that `getSchema` calls directly,
 * and what a resolver factory declares before its map becomes a private
 * field, or a module-level declaration when it needs no instance. The
 * factory's module remains loaded to preserve its initialization and bindings.
 */
export function inlineResolvers(
  project: Project,
  input: Input,
  index: SourceFile,
  cls: ClassDeclaration,
  member: PropertyDeclaration,
): InlinedResolvers {
  const located = resolverFactory(project, input, index, member);
  const filePath = located.file.getFilePath().slice(1);
  const names = takenNames(index, cls, member, located.file);
  const parameter = parameterOf(located, names);
  const all = factoryDeclarations(located, filePath);
  const references = factoryReferences(project.getTypeChecker(), [
    ...(located.param === undefined ? [] : [located.param]),
    ...all.map((entry) => entry.node),
  ]);
  const { declared, effects } = retainedDeclarations(located, all, references);
  const onInstance = instanceDeclarations(
    located,
    declared,
    references,
    filePath,
  );
  const targets = declarationTargets(
    located,
    parameter,
    declared,
    onInstance,
    names,
  );
  const instanceOwners = instanceThisOwners(
    located,
    declared,
    onInstance,
    filePath,
  );
  const textOf = rewrittenText(
    located,
    declared,
    targets,
    references,
    instanceOwners,
    filePath,
  );
  const fromDeclarations = declarationMembers(
    declared,
    targets,
    textOf,
    parameter,
  );
  const resolvers = resolverMembers(located.map, filePath, names, textOf);
  const plan = planFactoryFile(project, input, index, located, filePath);
  const factoryBefore =
    located.file === index ? undefined : located.file.getFullText();
  const keptExports = applyToIndex(
    index,
    cls.getNameOrThrow(),
    member,
    located,
    textOf,
    plan,
    {
      paramField: parameter.field,
      fields: [
        ...fromDeclarations.functionFields,
        ...fromDeclarations.fields,
        ...resolvers.fields,
      ],
      methods: resolvers.methods,
      hoisted: fromDeclarations.hoisted,
      called: new Set(
        [...resolvers.calls.values()].flatMap(({ callee }) => {
          const name = /^[\w$]+/.exec(callee)?.[0];
          return name === undefined || name === "subgraph" ? [] : [name];
        }),
      ),
      effects: [...effects].flatMap((node) => {
        const target = targets.get(node);
        return target?.kind === "member" ? [target.name] : [];
      }),
    },
  );
  const factoryFile =
    factoryBefore === undefined
      ? undefined
      : {
          path: filePath,
          before: factoryBefore,
          after: keptFactoryFile(located, { ...plan, keptExports }),
        };
  return {
    calls: resolvers.calls,
    firstMethod: resolvers.firstMethod,
    notes: plan.notes,
    ...(factoryFile && { factoryFile }),
  };
}

/**
 * Writes the converted members into index.ts: node edits first, then text
 * inserts, which leave earlier nodes stale.
 */
function applyToIndex(
  index: SourceFile,
  className: string,
  member: PropertyDeclaration,
  located: ResolverFactory,
  textOf: TextOf,
  plan: FactoryFilePlan,
  members: {
    readonly paramField: ParamField | undefined;
    /** The fields after the parameter's, function declarations first. */
    readonly fields: readonly string[];
    readonly methods: readonly string[];
    readonly hoisted: readonly string[];
    /** Names getSchema, written later, calls resolvers through. */
    readonly called: ReadonlySet<string>;
    readonly effects: readonly string[];
  },
): FactoryFilePlan["keptExports"] {
  if (located.importSpecifier !== undefined) {
    const declaration = located.importSpecifier.getImportDeclaration();
    located.importSpecifier.remove();
    if (
      declaration.getNamedImports().length === 0 &&
      declaration.getDefaultImport() === undefined &&
      declaration.getNamespaceImport() === undefined
    ) {
      declaration.replaceWithText(
        `import ${JSON.stringify(declaration.getModuleSpecifierValue())};`,
      );
    } else {
      index.insertImportDeclaration(declaration.getChildIndex(), {
        moduleSpecifier: declaration.getModuleSpecifierValue(),
      });
    }
  }
  const { paramField } = members;
  const fields = [
    ...(paramField === undefined
      ? []
      : [
          `readonly ${paramField.name}${paramField.type === undefined ? "" : `: ${textOf(paramField.type)}`} = ${paramField.value};`,
        ]),
    ...members.fields,
  ];
  if (fields.length === 0) member.remove();
  else member.replaceWithText(fields.join("\n\n"));
  if (members.effects.length > 0) {
    const target = index.getClassOrThrow(className);
    const constructor = target
      .getConstructors()
      .find((node) => node.getBody() !== undefined);
    const statements = members.effects.map((name) => `void this.${name};`);
    if (constructor === undefined) {
      if (localBindings(index).has("ConstructorParameters")) {
        refuse(
          index.getFilePath().slice(1),
          1,
          "ConstructorParameters is declared by this file, so the forwarding constructor cannot use the TypeScript utility type.",
          "Rename the local ConstructorParameters type before migrating.",
        );
      }
      target.addConstructor({
        parameters: [
          {
            name: "args",
            isRestParameter: true,
            type: "ConstructorParameters<typeof Subgraph>",
          },
        ],
        statements: ["super(...args);", ...statements],
      });
    } else {
      const afterSuper = constructor
        .getStatements()
        .findIndex(
          (statement) =>
            Node.isExpressionStatement(statement) &&
            Node.isCallExpression(statement.getExpression()) &&
            statement
              .getExpression()
              .getFirstChildByKind(SyntaxKind.SuperKeyword) !== undefined,
        );
      if (afterSuper < 0) {
        refuse(
          index.getFilePath().slice(1),
          lineOf(constructor),
          "The constructor has no direct super call after which the preserved initialization can be marked as used.",
          "Call super in its own statement, or keep this subgraph schema-first.",
        );
      }
      constructor.insertStatements(afterSuper + 1, statements);
    }
  }
  if (located.file === index && located.statement !== undefined) {
    index
      .getStatements()
      .find((statement) =>
        topLevelNames(statement).includes(located.factory.name),
      )
      ?.remove();
  }
  if (members.methods.length > 0) {
    const target = index.getClassOrThrow(className);
    const lastMember = target.getMembers().at(-1);
    index.insertText(
      lastMember === undefined ? target.getEnd() - 1 : lastMember.getEnd(),
      `\n\n${members.methods.join("\n\n")}\n`,
    );
  }
  if (members.hoisted.length > 0) {
    index.insertStatements(
      index.getClassOrThrow(className).getChildIndex(),
      `${members.hoisted.join("\n\n")}\n`,
    );
  }
  const imports = index.getImportDeclarations();
  const addedImports = index
    .insertStatements(
      imports.length === 0 ? 0 : imports.at(-1)!.getChildIndex() + 1,
      plan.imports.join("\n"),
    )
    .filter(Node.isImportDeclaration);
  const addedNames =
    located.importedFrom === undefined
      ? []
      : addNamedImports(
          index,
          located.importedFrom,
          plan.keptExports.map(({ name, isTypeOnly }) => ({
            name,
            ...(isTypeOnly && { isTypeOnly }),
          })),
        );
  const read = importReferences(index);
  const references = (name: string) =>
    read.has(name) || members.called.has(name);
  for (const named of addedNames) {
    if (!references((named.getAliasNode() ?? named.getNameNode()).getText())) {
      named.remove();
    }
  }
  for (const declaration of addedImports) {
    if (
      importBindings(declaration).every(
        ({ local }) => !references(local.getText()),
      )
    ) {
      declaration.remove();
    }
  }
  return plan.keptExports.filter(({ name }) => references(name));
}

/**
 * Exports the declarations index.ts now imports, preserving the original
 * factory and all module initialization statements.
 */
function keptFactoryFile(located: ResolverFactory, plan: FactoryFilePlan) {
  const { file } = located;
  for (const { name } of plan.keptExports) {
    const statement = file
      .getStatements()
      .find((candidate) => topLevelNames(candidate).includes(name));
    if (
      statement !== undefined &&
      Node.isExportable(statement) &&
      !statement.isExported()
    ) {
      // An added export would also shadow a name the module's own export *
      // re-exports for every importer.
      if (
        plan.readWhole ||
        file
          .getExportDeclarations()
          .some((declaration) => !declaration.hasNamedExports())
      ) {
        refuse(
          file.getFilePath().slice(1),
          lineOf(statement),
          "Moving the resolvers would change the export surface of a factory module that re-exports with export *, or that another file reads whole (import * as, export *, a dynamic import, or an importer outside the package).",
          "Move the shared declarations into a separate helper module before migrating, preserving the factory module's exports.",
        );
      }
      statement.setIsExported(true);
    }
  }
  return file.getFullText();
}
