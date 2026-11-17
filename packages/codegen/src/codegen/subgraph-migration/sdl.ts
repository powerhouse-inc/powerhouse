/** Reads the schema-first SDL from its gql literal, and prints a schema for comparison. */
import { GRAPHQL_TAG_PACKAGE } from "@powerhousedao/shared/clis";
import { getCatalogScalar } from "document-model/scalars";
import {
  buildASTSchema,
  type ConstDirectiveNode,
  type DocumentNode,
  GraphQLError,
  Kind,
  lexicographicSortSchema,
  parse,
  print,
  printSchema,
  type TypeDefinitionNode,
  visit,
} from "graphql";
import {
  type ArrayLiteralExpression,
  type ExportDeclaration,
  type ImportDeclaration,
  Node,
  type Project,
  type SourceFile,
  SyntaxKind,
  VariableDeclarationKind,
} from "ts-morph";
import {
  dirnameOf,
  importOf,
  type Input,
  KEPT_SDL,
  lineOf,
  localModule,
  readerTargets,
  refuse,
  type SdlSource,
  sourceFile,
  unwrap,
} from "./context.js";
import { isReference } from "./source-imports.js";

/**
 * @experimental The schema a document defines, printed with types, fields
 * and arguments sorted. An entity's `@key` uses follow as comments, since
 * GraphQL prints no applied directive but `@deprecated`.
 */
export function sortedSchemaText(document: DocumentNode): string {
  const keys: string[] = [];
  const stripped = withoutKeys(document, (typeName, directive) =>
    keys.push(`# ${typeName} ${print(directive)}`),
  );
  const text = printSchema(lexicographicSortSchema(buildASTSchema(stripped)));
  return keys.length === 0 ? text : `${text}\n\n${keys.sort().join("\n")}`;
}

/** `document` without the `@key` uses of its object types, which `found` receives. */
export function withoutKeys(
  document: DocumentNode,
  found: (typeName: string, directive: ConstDirectiveNode) => void = () => {},
): DocumentNode {
  return visit(document, {
    ObjectTypeDefinition(node) {
      const keys = (node.directives ?? []).filter(
        (directive) => directive.name.value === "key",
      );
      if (keys.length === 0) return undefined;
      for (const directive of keys) found(node.name.value, directive);
      return {
        ...node,
        directives: (node.directives ?? []).filter(
          (directive) => directive.name.value !== "key",
        ),
      };
    },
  });
}

/** Whether `tag` is graphql-tag's gql, as `file` imports it. */
function isGqlTag(file: SourceFile, tag: Node): boolean {
  const binding = Node.isIdentifier(tag)
    ? importOf(file, tag.getText())
    : undefined;
  return (
    binding?.specifier === GRAPHQL_TAG_PACKAGE && binding.imported === "gql"
  );
}

/**
 * The string an expression of `file` always evaluates to, when only string
 * literals, gql literals, `+`, `[...].join(separator)` and constants of the
 * subgraph's directory make it up; otherwise undefined.
 */
function staticString(
  project: Project,
  input: Input,
  file: SourceFile,
  node: Node,
  seen: ReadonlySet<Node> = new Set(),
): string | undefined {
  if (seen.has(node)) return undefined;
  const next = new Set([...seen, node]);
  const value = unwrap(node);
  const of = (child: Node, owner = file) =>
    staticString(project, input, owner, child, next);
  if (
    Node.isStringLiteral(value) ||
    Node.isNoSubstitutionTemplateLiteral(value)
  ) {
    return value.getLiteralValue();
  }
  if (Node.isTemplateExpression(value)) {
    let text = value.getHead().getLiteralText();
    for (const span of value.getTemplateSpans()) {
      const part = of(span.getExpression());
      if (part === undefined) return undefined;
      text += part + span.getLiteral().getLiteralText();
    }
    return text;
  }
  if (
    Node.isTaggedTemplateExpression(value) &&
    isGqlTag(file, value.getTag())
  ) {
    return of(value.getTemplate());
  }
  if (
    Node.isBinaryExpression(value) &&
    value.getOperatorToken().getKind() === SyntaxKind.PlusToken
  ) {
    const left = of(value.getLeft());
    const right = of(value.getRight());
    return left === undefined || right === undefined ? undefined : left + right;
  }
  if (Node.isCallExpression(value)) {
    const callee = value.getExpression();
    const args = value.getArguments();
    if (isGqlTag(file, callee) && args.length === 1) return of(args[0]);
    if (
      Node.isPropertyAccessExpression(callee) &&
      callee.getName() === "join" &&
      Node.isArrayLiteralExpression(unwrap(callee.getExpression())) &&
      args.length <= 1
    ) {
      const parts = (unwrap(callee.getExpression()) as ArrayLiteralExpression)
        .getElements()
        .map((element) => of(element));
      const separator = args.length === 0 ? "," : of(args[0]);
      if (separator === undefined || parts.some((part) => part === undefined)) {
        return undefined;
      }
      return parts.join(separator);
    }
    return undefined;
  }
  if (Node.isIdentifier(value)) {
    const local = file.getVariableDeclaration(value.getText());
    if (local !== undefined) {
      const initializer = local.getInitializer();
      return local.getVariableStatement()?.getDeclarationKind() ===
        VariableDeclarationKind.Const && initializer !== undefined
        ? of(initializer)
        : undefined;
    }
    const binding = importOf(file, value.getText());
    const path =
      binding === undefined
        ? undefined
        : localModule(
            input.files,
            dirnameOf(file.getFilePath().slice(1)),
            binding.specifier,
          );
    if (
      binding === undefined ||
      path === undefined ||
      !path.startsWith(`${input.dir}/`) ||
      !input.files.has(path)
    ) {
      return undefined;
    }
    const owner = sourceFile(project, input, path);
    const exported = owner.getVariableDeclaration(binding.imported);
    const initializer = exported?.getInitializer();
    return exported?.isExported() === true &&
      exported.getVariableStatement()?.getDeclarationKind() ===
        VariableDeclarationKind.Const &&
      initializer !== undefined
      ? of(initializer, owner)
      : undefined;
  }
  return undefined;
}

/**
 * The SDL of a gql literal, or of gql called on a string; its parts may be
 * constants of the directory. Undefined for anything else.
 */
function gqlLiteral(
  project: Project,
  input: Input,
  file: SourceFile,
  path: string,
  node: Node,
): { readonly text: string; readonly firstLine: number } | undefined {
  const value = unwrap(node);
  const isGql =
    (Node.isTaggedTemplateExpression(value) &&
      isGqlTag(file, value.getTag())) ||
    (Node.isCallExpression(value) && isGqlTag(file, value.getExpression()));
  if (!isGql) return undefined;
  const text = staticString(project, input, file, value);
  if (text === undefined) {
    refuse(
      path,
      lineOf(value),
      "The SDL is built by code that only runs at run time, so it is not known before then.",
      "Write the SDL as a gql literal, or build it only from string constants of the subgraph's directory.",
    );
  }
  const template = Node.isTaggedTemplateExpression(value)
    ? value.getTemplate()
    : value;
  return { text, firstLine: lineOf(template) };
}

export function schemaSource(
  project: Project,
  input: Input,
  index: SourceFile,
  typeDefs: Node,
): SdlSource {
  const indexPath = `${input.dir}/index.ts`;
  const inline = gqlLiteral(project, input, index, indexPath, typeDefs);
  const schemaPath = `${input.dir}/schema.ts`;
  if (inline !== undefined) {
    if (input.files.has(schemaPath)) {
      refuse(
        schemaPath,
        1,
        "typeDefs is inline, and the directory already has a schema.ts, which the conversion would write.",
        "Move or rename schema.ts.",
      );
    }
    return { file: indexPath, ...inline };
  }
  const value = unwrap(typeDefs);
  const binding = Node.isIdentifier(value)
    ? importOf(index, value.getText())
    : undefined;
  if (binding?.specifier === "./schema.graphql") {
    const graphqlPath = `${input.dir}/schema.graphql`;
    const text = input.files.get(graphqlPath);
    if (text === undefined) {
      refuse(
        indexPath,
        lineOf(typeDefs),
        "schema.graphql does not exist.",
        "Restore schema.graphql.",
      );
    }
    if (input.files.has(schemaPath)) {
      refuse(
        schemaPath,
        1,
        "typeDefs comes from schema.graphql, and the directory already has a schema.ts, which the conversion would write.",
        "Move or rename schema.ts.",
      );
    }
    return { file: graphqlPath, text, firstLine: 1 };
  }
  const module =
    binding === undefined
      ? undefined
      : localModule(input.files, input.dir, binding.specifier);
  if (binding === undefined || module !== schemaPath) {
    refuse(
      indexPath,
      lineOf(typeDefs),
      "typeDefs is neither a gql literal nor the schema exported by ./schema.ts.",
      "Set typeDefs to a gql literal, or to the gql literal schema.ts exports.",
    );
  }
  const schema = sourceFile(project, input, schemaPath);
  const declaration = schema.getVariableDeclaration(binding.imported);
  const literal =
    declaration?.getInitializer() === undefined
      ? undefined
      : gqlLiteral(
          project,
          input,
          schema,
          schemaPath,
          declaration.getInitializerOrThrow(),
        );
  if (declaration === undefined || literal === undefined) {
    refuse(
      schemaPath,
      1,
      `schema.ts does not declare ${binding.imported} as a gql literal.`,
      `Declare export const ${binding.imported} = gql\`...\` in schema.ts.`,
    );
  }
  for (const statement of schema.getStatements()) {
    if (
      Node.isImportDeclaration(statement) &&
      !statement.isTypeOnly() &&
      statement.getModuleSpecifierValue() !== GRAPHQL_TAG_PACKAGE
    ) {
      refuse(
        schemaPath,
        lineOf(statement),
        "schema.ts imports a runtime dependency whose initialization would be lost when the file is replaced.",
        "Move this import to index.ts before migrating, preserving its initialization order.",
      );
    }
    if (
      Node.isImportDeclaration(statement) ||
      statement === declaration.getVariableStatement()
    ) {
      continue;
    }
    refuse(
      schemaPath,
      lineOf(statement),
      "schema.ts holds more than the SDL, and the conversion replaces the whole file.",
      "Move this statement to another file.",
    );
  }
  if (declaration.getVariableStatement()?.getDeclarations().length !== 1) {
    refuse(
      schemaPath,
      lineOf(declaration),
      "schema.ts declares more than the SDL in one statement.",
      "Declare the SDL in its own statement.",
    );
  }
  checkSdlUses(
    input.files,
    index,
    indexPath,
    typeDefs,
    schemaPath,
    binding.imported,
  );
  for (const path of input.files.keys()) {
    if (!path.startsWith(`${input.dir}/`) || !/\.[cm]?[jt]sx?$/.test(path))
      continue;
    const file = sourceFile(project, input, path);
    for (const literal of file
      .getDescendants()
      .filter(
        (node) =>
          Node.isStringLiteral(node) ||
          Node.isNoSubstitutionTemplateLiteral(node),
      )) {
      const specifier = literal.getLiteralValue();
      if (
        !readerTargets(input.files, dirnameOf(path), specifier).includes(
          schemaPath,
        )
      )
        continue;
      if (!/^\.{1,2}\//.test(specifier)) {
        refuse(
          path,
          lineOf(literal),
          `${path} reads schema.ts through a package or alias path; the conversion cannot rewrite that path without changing its exports mapping.`,
          "Use a relative static import of the SDL, or keep it in a separate file before migrating.",
        );
      }
      if (/%[0-9a-f]{2}/i.test(specifier)) {
        refuse(
          path,
          lineOf(literal),
          `${path} reads schema.ts through a percent-encoded path, which the conversion cannot safely rewrite.`,
          "Use an unencoded relative import of the SDL before migrating.",
        );
      }
      const parent = literal.getParent();
      if (
        (Node.isImportDeclaration(parent) ||
          Node.isExportDeclaration(parent)) &&
        !/[?#]/.test(specifier)
      )
        continue;
      refuse(
        path,
        lineOf(literal),
        `${path} reads schema.ts through a path outside a static import or re-export; the conversion replaces its SDL with descriptors.`,
        "Import the SDL with a static import from a separate file, or keep this subgraph schema-first.",
      );
    }
  }
  // Other files that import the SDL keep it, from schema-sdl.ts.
  const sdlImporters = [...input.files.keys()].filter(
    (path) =>
      path.startsWith(`${input.dir}/`) &&
      path !== indexPath &&
      path !== schemaPath &&
      /\.[cm]?[jt]sx?$/.test(path) &&
      sdlSpecifiers(project, input, path, schemaPath).length > 0,
  );
  if (input.importedFromOutside?.has(schemaPath) === true) {
    refuse(
      schemaPath,
      1,
      "A reader outside the subgraph's relative import graph imports schema.ts, whose SDL the conversion replaces with descriptors.",
      "Import the SDL from a file of its own, or keep this subgraph schema-first.",
    );
  }
  if (
    sdlImporters.length > 0 &&
    input.files.has(`${input.dir}/${KEPT_SDL}.ts`)
  ) {
    refuse(
      `${input.dir}/${KEPT_SDL}.ts`,
      1,
      `${sdlImporters.join(", ")} import${sdlImporters.length === 1 ? "s" : ""} schema.ts's SDL, which the conversion keeps in ${KEPT_SDL}.ts, and that file already exists.`,
      `Move or rename ${KEPT_SDL}.ts.`,
    );
  }
  return { file: schemaPath, ...literal, sdlImporters };
}

/** The import and re-export declarations of `path` that name `target`. */
export function sdlSpecifiers(
  project: Project,
  input: Input,
  path: string,
  target: string,
): (ImportDeclaration | ExportDeclaration)[] {
  const file = sourceFile(project, input, path);
  return [
    ...file.getImportDeclarations(),
    ...file.getExportDeclarations(),
  ].filter((declaration) => {
    const specifier = declaration.getModuleSpecifierValue();
    return (
      specifier !== undefined &&
      localModule(input.files, dirnameOf(path), specifier) === target
    );
  });
}

/** The conversion replaces schema.ts's SDL export, so index.ts may read it only as typeDefs. */
function checkSdlUses(
  files: ReadonlyMap<string, string>,
  index: SourceFile,
  indexPath: string,
  typeDefs: Node,
  schemaPath: string,
  exportName: string,
) {
  const dir = dirnameOf(indexPath);
  const fromSchema = (declaration: {
    getModuleSpecifierValue(): string | undefined;
  }) => {
    const specifier = declaration.getModuleSpecifierValue();
    return (
      specifier !== undefined &&
      localModule(files, dir, specifier) === schemaPath
    );
  };
  const refuseUse = (name: string, node: Node): never =>
    refuse(
      indexPath,
      lineOf(node),
      `index.ts uses ${name} from schema.ts outside typeDefs.`,
      "Stop using it outside typeDefs, or keep this subgraph schema-first.",
    );
  const reexport = index.getExportDeclarations().find(fromSchema);
  if (reexport !== undefined) refuseUse(exportName, reexport);
  const locals = new Set(
    index
      .getImportDeclarations()
      .filter(fromSchema)
      .flatMap((declaration) => [
        ...declaration
          .getNamedImports()
          .map((named) => named.getAliasNode() ?? named.getNameNode()),
        ...[
          declaration.getDefaultImport(),
          declaration.getNamespaceImport(),
        ].filter((node) => node !== undefined),
      ])
      .flatMap((node) => node.getSymbol() ?? []),
  );
  const bindsImport = (node: Node) => {
    const symbol = node.getSymbol();
    return symbol !== undefined && locals.has(symbol);
  };
  const use = index
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .find(
      (identifier) =>
        isReference(identifier) &&
        bindsImport(identifier) &&
        identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) ===
          undefined &&
        (identifier.getStart() < typeDefs.getStart() ||
          identifier.getEnd() > typeDefs.getEnd()),
    );
  if (use !== undefined) refuseUse(use.getText(), use);
}

export function parseSdl(source: SdlSource): DocumentNode {
  try {
    return parse(source.text);
  } catch (error) {
    const line =
      error instanceof GraphQLError ? (error.locations?.[0]?.line ?? 1) : 1;
    refuse(
      source.file,
      source.firstLine + line - 1,
      `The SDL does not parse: ${error instanceof Error ? error.message : String(error)}`,
      "Fix the SDL.",
    );
  }
}

/** Each kind of type extension, by the kind of definition it extends. */
const EXTENDS: Partial<Record<Kind, Kind>> = {
  [Kind.OBJECT_TYPE_EXTENSION]: Kind.OBJECT_TYPE_DEFINITION,
  [Kind.INTERFACE_TYPE_EXTENSION]: Kind.INTERFACE_TYPE_DEFINITION,
  [Kind.UNION_TYPE_EXTENSION]: Kind.UNION_TYPE_DEFINITION,
  [Kind.ENUM_TYPE_EXTENSION]: Kind.ENUM_TYPE_DEFINITION,
  [Kind.INPUT_OBJECT_TYPE_EXTENSION]: Kind.INPUT_OBJECT_TYPE_DEFINITION,
};

/**
 * The SDL with each `extend` merged into the type it extends, as one schema
 * serves them. An extension of a type the SDL does not define stays, and is
 * refused later.
 */
export function mergeExtensions(document: DocumentNode): DocumentNode {
  type Mutable = { -readonly [K in keyof TypeDefinitionNode]?: unknown } & {
    kind: Kind;
    name: { value: string };
  };
  const definitions = document.definitions.map((definition) =>
    "name" in definition && definition.name !== undefined
      ? ({ ...definition } as unknown as Mutable)
      : (definition as unknown as Mutable),
  );
  const byName = new Map(
    definitions
      .filter((definition) => Object.values(EXTENDS).includes(definition.kind))
      .map((definition) => [definition.name.value, definition] as const),
  );
  const kept = definitions.filter((extension) => {
    const extended = EXTENDS[extension.kind];
    if (extended === undefined) return true;
    const base = byName.get(extension.name.value);
    if (base === undefined || base.kind !== extended) return true;
    for (const key of [
      "fields",
      "values",
      "types",
      "interfaces",
      "directives",
    ] as const) {
      const added = (extension as Record<string, unknown>)[key];
      if (!Array.isArray(added) || added.length === 0) continue;
      const own = (base as Record<string, unknown>)[key];
      (base as Record<string, unknown>)[key] = [
        ...(Array.isArray(own) ? (own as readonly unknown[]) : []),
        ...(added as readonly unknown[]),
      ];
    }
    return false;
  });
  return {
    ...document,
    definitions: kept as unknown as DocumentNode["definitions"],
  };
}

/**
 * The host declares the catalog scalars and the project's scalars for a
 * schema-first subgraph, so its SDL can use them without declaring them. The
 * document gets the declarations the SDL leaves out, as the host serves it.
 */
export function withHostScalars(
  document: DocumentNode,
  projectScalars: ReadonlySet<string>,
): DocumentNode {
  const defined = new Set(
    document.definitions.flatMap((definition) =>
      "name" in definition && definition.name !== undefined
        ? [definition.name.value]
        : [],
    ),
  );
  const missing = new Set<string>();
  visit(document, {
    NamedType(node) {
      const name = node.name.value;
      if (
        !defined.has(name) &&
        (getCatalogScalar(name) !== undefined || projectScalars.has(name))
      ) {
        missing.add(name);
      }
    },
  });
  if (missing.size === 0) return document;
  return {
    ...document,
    definitions: [
      ...document.definitions,
      ...parse([...missing].map((name) => `scalar ${name}`).join("\n"), {
        noLocation: true,
      }).definitions,
    ],
  };
}
