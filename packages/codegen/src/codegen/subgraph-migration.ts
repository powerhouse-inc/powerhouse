import {
  GRAPHQL_PACKAGE,
  GRAPHQL_TAG_PACKAGE,
  REACTOR_API_PACKAGE,
} from "@powerhousedao/shared/clis";
import {
  compileSubgraph,
  createSubgraphEntryBuilders,
  ph,
  projectSubgraphGraphQL,
} from "document-model";
import { defineScalar, getCatalogScalar } from "document-model/scalars";
import {
  buildASTSchema,
  type ConstDirectiveNode,
  type ConstValueNode,
  type DocumentNode,
  type FieldDefinitionNode,
  GraphQLError,
  type InputValueDefinitionNode,
  Kind,
  lexicographicSortSchema,
  type Location,
  parse,
  printSchema,
  type StringValueNode,
  type TypeDefinitionNode,
  type TypeNode,
  visit,
} from "graphql";
import {
  type ClassDeclaration,
  type ClassExpression,
  Node,
  type ObjectLiteralElementLike,
  type ObjectLiteralExpression,
  Project,
  type PropertyDeclaration,
  QuoteKind,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import { posix } from "node:path";
import { z } from "zod";
import { formatSafe } from "../utils/format-with-prettier.js";

/** @experimental Why a subgraph directory was not converted, and how to fix it. */
export type SubgraphMigrationRefusal = {
  /** Project-relative path. */
  readonly file: string;
  readonly line: number;
  readonly reason: string;
  readonly repair: string;
};

/** @experimental A file the conversion writes; `before` is null for a new file. */
export type SubgraphMigrationFile = {
  /** Project-relative path. */
  readonly path: string;
  readonly before: string | null;
  readonly after: string;
};

/**
 * @experimental The outcome of converting one schema-first subgraph
 * directory. `no-subgraph-class` is a directory whose `index.ts` declares
 * and exports no class, such as a directory of helpers.
 */
export type SubgraphMigration =
  | {
      readonly kind: "refused" | "no-subgraph-class";
      readonly dirName: string;
      readonly refusals: readonly SubgraphMigrationRefusal[];
    }
  | {
      readonly kind: "converted";
      readonly dirName: string;
      readonly subgraphName: string;
      readonly className: string;
      readonly files: readonly SubgraphMigrationFile[];
      /** The schema-first SDL as {@link sortedSchemaText} prints it. */
      readonly sdl: string;
      /** Project-relative path of the file the SDL was read from. */
      readonly sdlFile: string;
    };

/** @experimental The schema a document defines, printed with types, fields and arguments sorted. */
export function sortedSchemaText(document: DocumentNode): string {
  return printSchema(lexicographicSortSchema(buildASTSchema(document)));
}

const SUBGRAPH_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ROOT_KINDS = {
  Query: "query",
  Mutation: "mutation",
  Subscription: "subscription",
} as const;
type RootName = keyof typeof ROOT_KINDS;
const isRootName = (name: string): name is RootName =>
  Object.hasOwn(ROOT_KINDS, name);
const BUILT_IN_SCALARS = new Set(["String", "Int", "Float", "Boolean", "ID"]);
const SCALARS_ENTRY = "scalars/index.ts";
const RESOLVERS_FIELD = "#resolvers";
const DELEGATE_METHOD = "#delegate";
const REMOVED_FIELDS = new Set([
  "name",
  "typeDefs",
  "resolvers",
  "hasSubscriptions",
]);

class Refused extends Error {
  constructor(
    readonly refusal: SubgraphMigrationRefusal,
    readonly noSubgraphClass = false,
  ) {
    super(refusal.reason);
  }
}

function refuse(
  file: string,
  line: number,
  reason: string,
  repair: string,
): never {
  throw new Refused({ file, line, reason, repair });
}

/** The `ph` factory of each catalog scalar, keyed by scalar name. */
const catalogBuilders: ReadonlyMap<string, string> = new Map(
  Object.keys(ph).flatMap((key) => {
    const factory = (ph as Readonly<Record<string, unknown>>)[key];
    if (!/^[A-Z]/.test(key) || BUILT_IN_SCALARS.has(key)) return [];
    if (typeof factory !== "function") return [];
    const field = (factory as () => { identity: { name: string } })();
    return [[field.identity.name, key] as const];
  }),
);

type ScalarKind =
  | { readonly kind: "builtin" | "catalog"; readonly builder: string }
  | { readonly kind: "project"; readonly exportName: string };

type FieldOptions = {
  readonly required: boolean;
  readonly description?: string;
  readonly deprecated?: string;
  readonly defaultValue?: Json;
};

type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | { readonly [key: string]: Json };

type ResolverEntry = {
  readonly line: number;
  /** For a subscription: whether the original declares `resolve`. */
  readonly hasResolve: boolean;
};

type ResolverType = {
  readonly line: number;
  readonly fields: ReadonlyMap<string, ResolverEntry>;
};

type SdlSource = {
  readonly file: string;
  readonly text: string;
  /** The line of `file` the SDL's first line is on. */
  readonly firstLine: number;
};

type Input = {
  readonly dir: string;
  readonly files: ReadonlyMap<string, string>;
};

/**
 * @experimental Converts the schema-first subgraph in `subgraphs/<dirName>/`
 * into a code-first one, or explains why it cannot keep the same schema and
 * behaviour. `files` holds the project's files by project-relative path: at
 * least those of the directory, and `scalars/index.ts` when it exists.
 * Nothing is read from or written to disk.
 */
export async function migrateSubgraph(options: {
  readonly dirName: string;
  readonly files: ReadonlyMap<string, string>;
}): Promise<SubgraphMigration> {
  const input: Input = {
    dir: `subgraphs/${options.dirName}`,
    files: options.files,
  };
  try {
    return await convert(input, options.dirName);
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
    return {
      kind: error.noSubgraphClass ? "no-subgraph-class" : "refused",
      dirName: options.dirName,
      refusals: [error.refusal],
    };
  }
}

function sourceFile(project: Project, input: Input, path: string): SourceFile {
  const existing = project.getSourceFile(`/${path}`);
  if (existing !== undefined) return existing;
  const text = input.files.get(path);
  if (text === undefined) {
    refuse(path, 1, `${path} does not exist.`, "Restore the file.");
  }
  return project.createSourceFile(`/${path}`, text);
}

const lineOf = (node: Node) => node.getStartLineNumber();

function unwrap(node: Node): Node {
  let current = node;
  while (
    Node.isParenthesizedExpression(current) ||
    Node.isAsExpression(current) ||
    Node.isSatisfiesExpression(current)
  ) {
    current = current.getExpression();
  }
  return current;
}

/** The binding an identifier names in `file`, when an import declares it. */
function importOf(file: SourceFile, name: string) {
  for (const declaration of file.getImportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    const defaultImport = declaration.getDefaultImport();
    if (defaultImport?.getText() === name) {
      return { declaration, specifier, imported: "default" };
    }
    for (const named of declaration.getNamedImports()) {
      if ((named.getAliasNode() ?? named.getNameNode()).getText() === name) {
        return {
          declaration,
          specifier,
          imported: named.getName(),
          typeOnly: declaration.isTypeOnly() || named.isTypeOnly(),
        };
      }
    }
  }
  return undefined;
}

/** `./schema.js` and `./schema` both name `<dir>/schema.ts`. */
function localModule(dir: string, specifier: string): string | undefined {
  const match = /^\.\/([\w.-]+?)(?:\.[cm]?[jt]s)?$/.exec(specifier);
  return match === null ? undefined : `${dir}/${match[1]}.ts`;
}

function stringValue(node: Node | undefined): string | undefined {
  if (node === undefined) return undefined;
  const value = unwrap(node);
  return Node.isStringLiteral(value) ||
    Node.isNoSubstitutionTemplateLiteral(value)
    ? value.getLiteralValue()
    : undefined;
}

async function convert(
  input: Input,
  dirName: string,
): Promise<SubgraphMigration> {
  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: { quoteKind: QuoteKind.Double },
  });
  const indexPath = `${input.dir}/index.ts`;
  const index = sourceFile(project, input, indexPath);
  const cls = subgraphClass(project, input, index);
  const className = cls.getNameOrThrow();
  const members = classMembers(cls, indexPath);
  const sdlSource = schemaSource(project, input, index, members.typeDefs);
  const parsed = parseSdl(sdlSource);
  const resolverMap = readResolverMap(
    project,
    input,
    index,
    members.resolvers.getInitializerOrThrow(),
  );
  const scalars = readProjectScalars(project, input);
  const document = withHostScalars(parsed, scalars);
  const model = analyze(document, sdlSource, resolverMap, scalars);

  const hasSubscriptionType = model.roots.Subscription !== undefined;
  if (members.hasSubscriptions !== hasSubscriptionType) {
    refuse(
      indexPath,
      members.hasSubscriptionsLine,
      hasSubscriptionType
        ? "The SDL declares a Subscription type, but hasSubscriptions is not true, so the host does not serve its subscriptions. A code-first subgraph with a subscription always serves them."
        : "hasSubscriptions is true, but the SDL declares no Subscription type.",
      hasSubscriptionType
        ? "Set hasSubscriptions = true, or remove the Subscription type."
        : "Remove hasSubscriptions, or add the Subscription type.",
    );
  }

  const sdl = sortedSchemaText(document);
  checkStaticParity(model, members.name, sdl, sdlSource);

  const schemaPath = `${input.dir}/schema.ts`;
  const indexBefore = input.files.get(indexPath) ?? null;
  const schemaBefore = input.files.get(schemaPath) ?? null;
  const files: SubgraphMigrationFile[] = [
    {
      path: indexPath,
      before: indexBefore,
      after: withLineEndings(
        await indexFileText(index, cls, members, model),
        indexBefore,
      ),
    },
    {
      path: schemaPath,
      before: schemaBefore,
      after: withLineEndings(
        await formatSafe(schemaFileText(model, members.name)),
        schemaBefore ?? indexBefore,
      ),
    },
  ];
  return {
    kind: "converted",
    dirName,
    subgraphName: members.name,
    className,
    files: files.filter((file) => file.before !== file.after),
    sdl,
    sdlFile: sdlSource.file,
  };
}

/** `text` with the line ending of the first line of `like`. */
function withLineEndings(text: string, like: string | null): string {
  return like !== null && /\r?\n/.exec(like)?.[0] === "\r\n"
    ? text.replace(/\r?\n/g, "\r\n")
    : text;
}

function subgraphClass(
  project: Project,
  input: Input,
  index: SourceFile,
): ClassDeclaration {
  const path = `${input.dir}/index.ts`;
  if (/\bdefineIndexSubgraph\b/.test(index.getFullText())) {
    const call = index
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .find((node) => node.getText() === "defineIndexSubgraph");
    refuse(
      path,
      call === undefined ? 1 : lineOf(call),
      "The subgraph is built with defineIndexSubgraph, which has no code-first form.",
      "Keep this subgraph schema-first.",
    );
  }
  const classes = index
    .getClasses()
    .filter((cls) => cls.getExtends() && cls.isExported());
  const subgraphs = classes.filter((cls) => {
    const base = unwrap(cls.getExtends()!.getExpression());
    if (!Node.isIdentifier(base)) return false;
    const binding = importOf(index, base.getText());
    return (
      binding?.specifier === REACTOR_API_PACKAGE &&
      binding.imported === "BaseSubgraph" &&
      !binding.typeOnly
    );
  });
  if (subgraphs.length === 0) {
    const other = classes.at(0);
    const found = subgraphCandidate(project, input, index);
    if (found.kind === "none") {
      throw new Refused(
        {
          file: path,
          line: 1,
          reason: "index.ts exports no subgraph class.",
          repair:
            "Name a directory that holds a subgraph, or move the helpers out of subgraphs/.",
        },
        true,
      );
    }
    if (found.kind === "outside") {
      refuse(
        path,
        lineOf(found.node),
        `index.ts exports ${found.name} from ${found.specifier}, outside ${input.dir}, so it is not converted here.`,
        "Move the subgraph class into this directory, or convert it by hand.",
      );
    }
    refuse(
      path,
      other === undefined ? 1 : lineOf(other),
      other === undefined
        ? "index.ts exports no class that extends BaseSubgraph."
        : `${other.getName() ?? "The class"} extends ${other.getExtends()!.getExpression().getText()}, not BaseSubgraph from ${REACTOR_API_PACKAGE}. Only a class that extends BaseSubgraph directly converts.`,
      "Convert the subgraph by hand, or make it extend BaseSubgraph directly.",
    );
  }
  if (subgraphs.length > 1) {
    refuse(
      path,
      lineOf(subgraphs[1]),
      "index.ts exports more than one BaseSubgraph class.",
      "Move each subgraph into its own directory under subgraphs/.",
    );
  }
  const [cls] = subgraphs;
  if (cls.getName() === undefined) {
    refuse(
      path,
      lineOf(cls),
      "The subgraph class has no name, which a code-first subgraph's builder type needs.",
      "Name the class.",
    );
  }
  if (cls.getTypeParameters().length > 0 || cls.isAbstract()) {
    refuse(
      path,
      lineOf(cls),
      "A generic or abstract subgraph class cannot become a code-first subgraph, whose builder is typed by the concrete class.",
      "Convert the subgraph by hand.",
    );
  }
  return cls;
}

/**
 * Whether `index.ts` can export a subgraph class: a class whose `extends`
 * chain reaches BaseSubgraph or a base outside the directory, or any value
 * from a relative module outside it. A directory with none of these holds
 * helpers.
 */
function subgraphCandidate(
  project: Project,
  input: Input,
  index: SourceFile,
):
  | { readonly kind: "none" | "subgraph" }
  | {
      readonly kind: "outside";
      readonly name: string;
      readonly specifier: string;
      readonly node: Node;
    } {
  for (const [path, text] of input.files) {
    if (
      path.startsWith(`${input.dir}/`) &&
      /\.[cm]?tsx?$/.test(path) &&
      project.getSourceFile(`/${path}`) === undefined
    ) {
      project.createSourceFile(`/${path}`, text);
    }
  }
  const outside = (file: SourceFile, specifier: string) => {
    if (!specifier.startsWith(".")) return false;
    const target = posix
      .join(file.getDirectory().getPath(), specifier)
      .replace(/\.[cm]?jsx?$/, "");
    return [".ts", ".tsx", ".mts", "/index.ts"].every(
      (suffix) => project.getSourceFile(`${target}${suffix}`) === undefined,
    );
  };
  for (const declaration of index.getExportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    const names = declaration.getNamedExports();
    if (specifier !== undefined) {
      if (outside(index, specifier)) {
        return {
          kind: "outside",
          name: names.map((named) => named.getName()).join(", ") || "*",
          specifier,
          node: declaration,
        };
      }
      continue;
    }
    for (const named of names) {
      const binding = importOf(index, named.getName());
      if (binding !== undefined && outside(index, binding.specifier)) {
        return {
          kind: "outside",
          name: named.getName(),
          specifier: binding.specifier,
          node: named,
        };
      }
    }
  }
  const reachesSubgraph = (
    cls: ClassDeclaration | ClassExpression,
    seen: Set<Node>,
  ): boolean => {
    const extended = cls.getExtends();
    if (extended === undefined || seen.has(cls)) return false;
    seen.add(cls);
    if (extended.getExpression().getText().includes("BaseSubgraph")) {
      return true;
    }
    const base = cls.getBaseClass();
    if (base !== undefined) return reachesSubgraph(base, seen);
    const expression = unwrap(extended.getExpression());
    const binding = Node.isIdentifier(expression)
      ? importOf(cls.getSourceFile(), expression.getText())
      : undefined;
    return (
      binding !== undefined && outside(cls.getSourceFile(), binding.specifier)
    );
  };
  const classes = [...index.getExportedDeclarations().values()]
    .flat()
    .flatMap((node) => {
      if (Node.isClassDeclaration(node) || Node.isClassExpression(node)) {
        return [node];
      }
      const initializer = Node.isVariableDeclaration(node)
        ? node.getInitializer()
        : undefined;
      return initializer !== undefined && Node.isClassExpression(initializer)
        ? [initializer]
        : [];
    });
  return classes.some((cls) => reachesSubgraph(cls, new Set()))
    ? { kind: "subgraph" }
    : { kind: "none" };
}

type Members = {
  readonly name: string;
  readonly typeDefs: Node;
  readonly resolvers: PropertyDeclaration;
  readonly hasSubscriptions: boolean;
  readonly hasSubscriptionsLine: number;
  readonly removed: readonly PropertyDeclaration[];
};

function classMembers(cls: ClassDeclaration, path: string): Members {
  const fields = new Map<string, PropertyDeclaration>();
  for (const member of cls.getMembers()) {
    const name = Node.hasName(member) ? member.getName() : undefined;
    if (name === undefined) continue;
    const isStatic = Node.isStaticable(member) && member.isStatic();
    if (isStatic && (name === "subgraphName" || name === "getSchema")) {
      refuse(
        path,
        lineOf(member),
        `The class already declares static ${name}, which a code-first subgraph uses for its own purpose.`,
        `Rename static ${name}.`,
      );
    }
    if (name === RESOLVERS_FIELD || name === DELEGATE_METHOD) {
      refuse(
        path,
        lineOf(member),
        `The class already declares ${name}, a name the conversion adds.`,
        `Rename ${name}.`,
      );
    }
    if (isStatic) continue;
    if (name === "path") {
      refuse(
        path,
        lineOf(member),
        "The class sets path, which the host injects and a code-first subgraph cannot set.",
        "Remove the path field.",
      );
    }
    if (!REMOVED_FIELDS.has(name)) continue;
    if (!Node.isPropertyDeclaration(member)) {
      refuse(
        path,
        lineOf(member),
        `${name} is not a field with an initializer.`,
        `Declare ${name} as a field initialized with its value.`,
      );
    }
    fields.set(name, member);
  }
  for (const assignment of cls.getDescendantsOfKind(
    SyntaxKind.BinaryExpression,
  )) {
    const left = unwrap(assignment.getLeft());
    if (
      assignment.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
      Node.isPropertyAccessExpression(left) &&
      left.getExpression().getKind() === SyntaxKind.ThisKeyword &&
      REMOVED_FIELDS.has(left.getName())
    ) {
      refuse(
        path,
        lineOf(assignment),
        `The class assigns this.${left.getName()}. A code-first subgraph's ${left.getName()} comes from getSchema, and the host refuses an instance that changes it.`,
        `Remove the assignment to this.${left.getName()}.`,
      );
    }
  }
  const required = (field: string) => {
    const member = fields.get(field);
    const initializer = member?.getInitializer();
    if (member === undefined || initializer === undefined) {
      refuse(
        path,
        lineOf(member ?? cls),
        `The class has no ${field} field with an initializer.`,
        `Initialize ${field} in the class body.`,
      );
    }
    return { member, initializer };
  };
  const nameField = required("name");
  const name = stringValue(nameField.initializer);
  if (name === undefined) {
    refuse(
      path,
      lineOf(nameField.member),
      "name is not a string literal, so its route cannot be known.",
      "Set name to a string literal.",
    );
  }
  if (!SUBGRAPH_NAME.test(name)) {
    refuse(
      path,
      lineOf(nameField.member),
      `The subgraph name ${JSON.stringify(name)} is not lowercase kebab-case. A code-first subgraphName must be, and renaming it would move the route.`,
      "Keep this subgraph schema-first, or rename it to lowercase kebab-case first and update its clients.",
    );
  }
  const typeDefs = required("typeDefs");
  const resolvers = required("resolvers");
  const subscriptions = fields.get("hasSubscriptions");
  let hasSubscriptions = false;
  if (subscriptions !== undefined) {
    const value = subscriptions.getInitializer();
    const kind = value === undefined ? undefined : unwrap(value).getKind();
    if (kind !== SyntaxKind.TrueKeyword && kind !== SyntaxKind.FalseKeyword) {
      refuse(
        path,
        lineOf(subscriptions),
        "hasSubscriptions is not true or false.",
        "Initialize hasSubscriptions with true or false.",
      );
    }
    hasSubscriptions = kind === SyntaxKind.TrueKeyword;
  }
  return {
    name,
    typeDefs: typeDefs.initializer,
    resolvers: resolvers.member,
    hasSubscriptions,
    hasSubscriptionsLine: lineOf(subscriptions ?? nameField.member),
    removed: [...fields.values()],
  };
}

function gqlLiteral(
  file: SourceFile,
  path: string,
  node: Node,
): { readonly text: string; readonly firstLine: number } | undefined {
  const value = unwrap(node);
  if (!Node.isTaggedTemplateExpression(value)) return undefined;
  const tag = value.getTag();
  const binding = Node.isIdentifier(tag)
    ? importOf(file, tag.getText())
    : undefined;
  if (
    binding?.specifier !== GRAPHQL_TAG_PACKAGE ||
    binding.imported !== "gql"
  ) {
    return undefined;
  }
  const template = value.getTemplate();
  if (!Node.isNoSubstitutionTemplateLiteral(template)) {
    refuse(
      path,
      lineOf(template),
      "The gql literal interpolates ${...}, so its SDL is not known until it runs.",
      "Inline the interpolated SDL into the literal.",
    );
  }
  return { text: template.getLiteralValue(), firstLine: lineOf(template) };
}

function schemaSource(
  project: Project,
  input: Input,
  index: SourceFile,
  typeDefs: Node,
): SdlSource {
  const indexPath = `${input.dir}/index.ts`;
  const inline = gqlLiteral(index, indexPath, typeDefs);
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
      : localModule(input.dir, binding.specifier);
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
      : gqlLiteral(schema, schemaPath, declaration.getInitializerOrThrow());
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
  checkSdlUses(index, indexPath, typeDefs, schemaPath, binding.imported);
  for (const [path, text] of input.files) {
    if (
      !path.startsWith(`${input.dir}/`) ||
      path === indexPath ||
      path === schemaPath ||
      !/\.[cm]?tsx?$/.test(path)
    ) {
      continue;
    }
    const other = project.createSourceFile(`/${path}.probe.ts`, text);
    const importer = other
      .getImportDeclarations()
      .find(
        (declaration) =>
          localModule(
            dirnameOf(path),
            declaration.getModuleSpecifierValue(),
          ) === schemaPath,
      );
    project.removeSourceFile(other);
    if (importer !== undefined) {
      refuse(
        path,
        lineOf(importer),
        `${path} imports schema.ts, whose SDL export the conversion replaces.`,
        "Remove the import.",
      );
    }
  }
  return { file: schemaPath, ...literal };
}

const dirnameOf = (path: string) => path.slice(0, path.lastIndexOf("/"));

/** The conversion replaces schema.ts's SDL export, so index.ts may read it only as typeDefs. */
function checkSdlUses(
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
      specifier !== undefined && localModule(dir, specifier) === schemaPath
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

function parseSdl(source: SdlSource): DocumentNode {
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

/**
 * The host declares the catalog scalars and the project's scalars for a
 * schema-first subgraph, so its SDL can use them without declaring them. The
 * document gets the declarations the SDL leaves out, as the host serves it.
 */
function withHostScalars(
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
        (catalogBuilders.has(name) || projectScalars.has(name))
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

/** The object literal a resolver initializer evaluates to, read without running it. */
function readResolverMap(
  project: Project,
  input: Input,
  index: SourceFile,
  initializer: Node,
): ReadonlyMap<string, ResolverType> & { readonly file: string } {
  const indexPath = `${input.dir}/index.ts`;
  const value = unwrap(initializer);
  if (Node.isObjectLiteralExpression(value)) {
    return Object.assign(resolverTypes(value, indexPath), { file: indexPath });
  }
  const callee = Node.isCallExpression(value)
    ? unwrap(value.getExpression())
    : undefined;
  if (callee === undefined || !Node.isIdentifier(callee)) {
    refuse(
      indexPath,
      lineOf(initializer),
      "resolvers is neither an object literal nor a call of a resolver factory.",
      "Set resolvers to an object literal, or to getResolvers(this) where getResolvers returns one.",
    );
  }
  const binding = importOf(index, callee.getText());
  const path =
    binding === undefined
      ? indexPath
      : localModule(input.dir, binding.specifier);
  if (path === undefined) {
    refuse(
      indexPath,
      lineOf(initializer),
      `${callee.getText()} is imported from ${binding?.specifier}, outside this subgraph's directory.`,
      "Move the resolver factory into the subgraph's directory.",
    );
  }
  const file = sourceFile(project, input, path);
  const name = binding?.imported ?? callee.getText();
  const declaration =
    file.getFunction(name) ??
    file.getVariableDeclaration(name)?.getInitializer();
  const factory = declaration === undefined ? undefined : unwrap(declaration);
  if (
    factory === undefined ||
    !(
      Node.isFunctionDeclaration(factory) ||
      Node.isArrowFunction(factory) ||
      Node.isFunctionExpression(factory)
    )
  ) {
    refuse(
      path,
      1,
      `${path} does not declare ${name} as a function.`,
      `Declare ${name} as a function that returns an object literal.`,
    );
  }
  const body = factory.getBody();
  let returned: Node | undefined;
  if (body !== undefined && !Node.isBlock(body)) {
    returned = body;
  } else if (body !== undefined) {
    const returns = body
      .getDescendantsOfKind(SyntaxKind.ReturnStatement)
      .filter(
        (statement) =>
          statement.getFirstAncestor(
            (node) =>
              Node.isFunctionDeclaration(node) ||
              Node.isArrowFunction(node) ||
              Node.isFunctionExpression(node) ||
              Node.isMethodDeclaration(node),
          ) === factory,
      );
    if (returns.length === 1) returned = returns[0].getExpression();
  }
  const map = returned === undefined ? undefined : unwrap(returned);
  if (map === undefined || !Node.isObjectLiteralExpression(map)) {
    refuse(
      path,
      lineOf(factory),
      `${name} does not return one object literal, so its resolver coordinates cannot be read.`,
      `Make ${name} end in a single return of an object literal.`,
    );
  }
  return Object.assign(resolverTypes(map, path), { file: path });
}

function propertyName(element: ObjectLiteralElementLike, path: string): string {
  if (Node.isPropertyAssignment(element) || Node.isMethodDeclaration(element)) {
    const name = element.getNameNode();
    if (Node.isIdentifier(name)) return name.getText();
    if (Node.isStringLiteral(name)) return name.getLiteralValue();
  }
  refuse(
    path,
    lineOf(element),
    Node.isSpreadAssignment(element)
      ? "The resolver map spreads another object, so its coordinates cannot be read."
      : `${element.getText().split("\n")[0]} is not a plain key of the resolver map.`,
    "Write every type and field of the resolver map as a plain key with its value.",
  );
}

function resolverTypes(
  map: ObjectLiteralExpression,
  path: string,
): Map<string, ResolverType> {
  const types = new Map<string, ResolverType>();
  for (const element of map.getProperties()) {
    const typeName = propertyName(element, path);
    const value = Node.isPropertyAssignment(element)
      ? unwrap(element.getInitializerOrThrow())
      : undefined;
    if (value === undefined || !Node.isObjectLiteralExpression(value)) {
      refuse(
        path,
        lineOf(element),
        `The resolvers of ${typeName} are not an object literal.`,
        `Write ${typeName}'s resolvers as an object literal.`,
      );
    }
    const fields = new Map<string, ResolverEntry>();
    for (const field of value.getProperties()) {
      const fieldName = Node.isShorthandPropertyAssignment(field)
        ? field.getName()
        : propertyName(field, path);
      const fieldValue = Node.isPropertyAssignment(field)
        ? unwrap(field.getInitializerOrThrow())
        : undefined;
      let hasResolve = false;
      if (typeName === "Subscription") {
        if (
          fieldValue === undefined ||
          !Node.isObjectLiteralExpression(fieldValue)
        ) {
          refuse(
            path,
            lineOf(field),
            `Subscription.${fieldName} is not an object literal with subscribe.`,
            `Write Subscription.${fieldName} as { subscribe, resolve? }.`,
          );
        }
        const steps = fieldValue
          .getProperties()
          .map((step) => propertyName(step, path));
        const unknown = steps.find(
          (step) => step !== "subscribe" && step !== "resolve",
        );
        if (unknown !== undefined || !steps.includes("subscribe")) {
          refuse(
            path,
            lineOf(field),
            unknown === undefined
              ? `Subscription.${fieldName} has no subscribe function.`
              : `Subscription.${fieldName} declares ${unknown}, which has no code-first form.`,
            `Give Subscription.${fieldName} exactly subscribe and, optionally, resolve.`,
          );
        }
        hasResolve = steps.includes("resolve");
      } else if (
        fieldValue !== undefined &&
        Node.isObjectLiteralExpression(fieldValue)
      ) {
        refuse(
          path,
          lineOf(field),
          `${typeName}.${fieldName} is a field config object, not a function.`,
          `Write ${typeName}.${fieldName} as a resolver function.`,
        );
      }
      fields.set(fieldName, { line: lineOf(field), hasResolve });
    }
    types.set(typeName, { line: lineOf(element), fields });
  }
  return types;
}

function readProjectScalars(
  project: Project,
  input: Input,
): ReadonlySet<string> {
  if (!input.files.has(SCALARS_ENTRY)) return new Set();
  const file = sourceFile(project, input, SCALARS_ENTRY);
  return new Set(file.getExportedDeclarations().keys());
}

type Located = { readonly loc?: Location };

const sdlLine = (source: SdlSource, node: Located) =>
  source.firstLine + (node.loc?.startToken.line ?? 1) - 1;

type ComputedField = {
  readonly typeName: string;
  readonly field: FieldDefinitionNode;
};

type Model = {
  readonly source: SdlSource;
  readonly types: readonly TypeDefinitionNode[];
  readonly typeKinds: ReadonlyMap<string, TypeDefinitionNode["kind"]>;
  readonly scalars: ReadonlyMap<string, ScalarKind>;
  readonly roots: Partial<Record<RootName, readonly FieldDefinitionNode[]>>;
  readonly computed: readonly ComputedField[];
  /** Fields of each object type left in its descriptor. */
  readonly descriptorFields: ReadonlyMap<
    string,
    readonly FieldDefinitionNode[]
  >;
  readonly resolveTypes: readonly string[];
  /** Types no field reaches, each served by a `schema.type` entry. */
  readonly typeEntries: readonly string[];
  readonly subscriptionsWithResolve: ReadonlySet<string>;
};

function analyze(
  document: DocumentNode,
  source: SdlSource,
  resolverMap: ReadonlyMap<string, ResolverType> & { readonly file: string },
  projectScalars: ReadonlySet<string>,
): Model {
  function refuseAt(node: Located, reason: string, repair: string): never {
    return refuse(source.file, sdlLine(source, node), reason, repair);
  }

  const definitions = new Map<string, TypeDefinitionNode>();
  for (const definition of document.definitions) {
    switch (definition.kind) {
      case Kind.SCHEMA_DEFINITION:
      case Kind.SCHEMA_EXTENSION:
        refuseAt(
          definition,
          "The SDL declares a schema block, which a code-first subgraph cannot.",
          "Remove the schema block and use the root type names Query, Mutation and Subscription.",
        );
        break;
      case Kind.DIRECTIVE_DEFINITION:
        refuseAt(
          definition,
          `The SDL defines the directive @${definition.name.value}, which a code-first subgraph cannot.`,
          "Keep this subgraph schema-first.",
        );
        break;
      case Kind.OBJECT_TYPE_EXTENSION:
      case Kind.INTERFACE_TYPE_EXTENSION:
      case Kind.UNION_TYPE_EXTENSION:
      case Kind.ENUM_TYPE_EXTENSION:
      case Kind.INPUT_OBJECT_TYPE_EXTENSION:
      case Kind.SCALAR_TYPE_EXTENSION:
        refuseAt(
          definition,
          `The SDL extends ${definition.name.value} with extend, which a code-first subgraph cannot.`,
          `Merge the extension into ${definition.name.value}'s definition, or keep this subgraph schema-first.`,
        );
        break;
      case Kind.OPERATION_DEFINITION:
      case Kind.FRAGMENT_DEFINITION:
        refuseAt(
          definition,
          "The SDL holds an operation or fragment.",
          "Remove it from the SDL.",
        );
        break;
      default:
        definitions.set(definition.name.value, definition);
    }
  }

  visit(document, {
    Directive(node) {
      if (node.name.value === "deprecated") return;
      refuse(
        source.file,
        sdlLine(source, node),
        `@${node.name.value} is a directive other than @deprecated, which a code-first subgraph cannot declare.`,
        `Remove @${node.name.value}, or keep this subgraph schema-first.`,
      );
    },
    NamedType(node) {
      const name = node.name.value;
      if (BUILT_IN_SCALARS.has(name) || definitions.has(name)) return;
      if (getCatalogScalar(name) !== undefined) {
        refuseAt(
          node,
          `The SDL uses the scalar ${name}, which only the host declares and a code-first subgraph cannot use.`,
          `Keep this subgraph schema-first, or change ${name} to a scalar a code-first subgraph can use.`,
        );
      }
      refuseAt(
        node,
        `The SDL references ${name}, which it does not define. A schema-first subgraph can use a type the host adds, such as a document-model type; a code-first one cannot.`,
        `Define ${name} in the SDL, or keep this subgraph schema-first.`,
      );
    },
  });

  try {
    buildASTSchema(document);
  } catch (error) {
    refuse(
      source.file,
      source.firstLine,
      `The SDL is not a valid schema: ${error instanceof Error ? error.message : String(error)}`,
      "Fix the SDL.",
    );
  }

  const scalars = new Map<string, ScalarKind>();
  for (const name of BUILT_IN_SCALARS) {
    scalars.set(name, { kind: "builtin", builder: name });
  }
  const types: TypeDefinitionNode[] = [];
  const roots: Partial<Record<RootName, readonly FieldDefinitionNode[]>> = {};
  for (const definition of definitions.values()) {
    const name = definition.name.value;
    if (definition.kind === Kind.SCALAR_TYPE_DEFINITION) {
      const catalog = catalogBuilders.get(name);
      if (definition.description !== undefined) {
        refuseAt(
          definition,
          `The scalar ${name} has a description, which a code-first subgraph does not declare.`,
          "Remove the scalar's description.",
        );
      }
      if (catalog !== undefined) {
        scalars.set(name, { kind: "catalog", builder: catalog });
      } else if (getCatalogScalar(name) !== undefined) {
        refuseAt(
          definition,
          `The scalar ${name} is one only the host declares, which a code-first subgraph cannot use.`,
          `Keep this subgraph schema-first, or change ${name} to a scalar a code-first subgraph can use.`,
        );
      } else if (projectScalars.has(name)) {
        scalars.set(name, { kind: "project", exportName: name });
      } else {
        refuseAt(
          definition,
          `The scalar ${name} is neither a catalog scalar nor exported by ${SCALARS_ENTRY}.`,
          `Declare ${name} with defineScalar and export it from ${SCALARS_ENTRY}.`,
        );
      }
      continue;
    }
    if (isRootName(name)) {
      if (definition.kind !== Kind.OBJECT_TYPE_DEFINITION) {
        refuseAt(
          definition,
          `${name} is not an object type.`,
          `Make ${name} an object type.`,
        );
      }
      if (
        definition.description !== undefined ||
        (definition.interfaces?.length ?? 0) > 0
      ) {
        refuseAt(
          definition,
          `The root type ${name} has a description or implements an interface, which a code-first subgraph's root types cannot.`,
          `Remove the description and interfaces from ${name}.`,
        );
      }
      roots[name] = definition.fields ?? [];
      continue;
    }
    if (name.startsWith("_")) {
      refuseAt(
        definition,
        `The type name ${name} starts with an underscore, which Apollo Federation reserves.`,
        `Rename ${name}.`,
      );
    }
    types.push(definition);
  }
  if (
    roots.Query === undefined &&
    roots.Mutation === undefined &&
    roots.Subscription === undefined
  ) {
    refuse(
      source.file,
      source.firstLine,
      "The SDL declares no Query, Mutation or Subscription type.",
      "Add a root type.",
    );
  }

  const computed: ComputedField[] = [];
  const descriptorFields = new Map<string, readonly FieldDefinitionNode[]>();
  const resolveTypes: string[] = [];
  const subscriptionsWithResolve = new Set<string>();
  function refuseMap(line: number, reason: string, repair: string): never {
    return refuse(resolverMap.file, line, reason, repair);
  }

  for (const [typeName, entry] of resolverMap) {
    const definition = definitions.get(typeName);
    if (definition === undefined) {
      refuseMap(
        entry.line,
        `The resolver map names ${typeName}, which the SDL does not define. The host ignores it.`,
        `Remove ${typeName} from the resolver map.`,
      );
    }
    const kind = definition.kind;
    for (const [fieldName, field] of entry.fields) {
      const coordinate = `${typeName}.${fieldName}`;
      if (fieldName === "__resolveType") {
        if (
          kind !== Kind.UNION_TYPE_DEFINITION &&
          kind !== Kind.INTERFACE_TYPE_DEFINITION
        ) {
          refuseMap(
            field.line,
            `${coordinate} is set on a type that is not a union or an interface.`,
            `Remove ${coordinate}.`,
          );
        }
        resolveTypes.push(typeName);
        continue;
      }
      if (fieldName === "__isTypeOf") {
        refuseMap(
          field.line,
          `${coordinate} has no code-first form.`,
          `Replace ${coordinate} with __resolveType on the abstract types ${typeName} belongs to.`,
        );
      }
      if (fieldName.startsWith("__")) {
        refuseMap(
          field.line,
          `${coordinate} has no code-first form${fieldName === "__resolveReference" ? "; federation entities are not supported" : ""}.`,
          `Remove ${coordinate}, or keep this subgraph schema-first.`,
        );
      }
      if (kind === Kind.SCALAR_TYPE_DEFINITION) {
        refuseMap(
          field.line,
          `The resolver map gives the scalar ${typeName} an implementation. A code-first subgraph's scalars come from the catalog or ${SCALARS_ENTRY}.`,
          `Remove ${typeName} from the resolver map and declare it with defineScalar in ${SCALARS_ENTRY}.`,
        );
      }
      if (kind !== Kind.OBJECT_TYPE_DEFINITION) {
        refuseMap(
          field.line,
          `${coordinate} is set on ${kind === Kind.INTERFACE_TYPE_DEFINITION ? "an interface field, which the host ignores" : kind === Kind.ENUM_TYPE_DEFINITION ? "an enum, whose internal values have no code-first form" : "a type that takes no resolvers"}.`,
          `Remove ${coordinate}.`,
        );
      }
      if (
        !(definition.fields ?? []).some(
          (candidate) => candidate.name.value === fieldName,
        )
      ) {
        refuseMap(
          field.line,
          `The resolver map names ${coordinate}, which the SDL does not define. The host ignores it.`,
          `Remove ${coordinate}.`,
        );
      }
      if (typeName === "Subscription" && field.hasResolve) {
        subscriptionsWithResolve.add(fieldName);
      }
    }
  }
  for (const field of roots.Subscription ?? []) {
    if (!resolverMap.get("Subscription")?.fields.has(field.name.value)) {
      refuseAt(
        field,
        `Subscription.${field.name.value} has no subscribe resolver.`,
        `Add Subscription.${field.name.value}: { subscribe } to the resolver map.`,
      );
    }
  }
  for (const type of types) {
    if (type.kind === Kind.INTERFACE_TYPE_DEFINITION) {
      for (const field of type.fields ?? []) {
        if ((field.arguments?.length ?? 0) > 0) {
          refuseAt(
            field,
            `The interface field ${type.name.value}.${field.name.value} takes arguments, which a code-first interface field cannot.`,
            "Keep this subgraph schema-first.",
          );
        }
      }
    }
    if (type.kind !== Kind.OBJECT_TYPE_DEFINITION) continue;
    const resolved = resolverMap.get(type.name.value)?.fields;
    const own: FieldDefinitionNode[] = [];
    for (const field of type.fields ?? []) {
      if (
        resolved?.has(field.name.value) ||
        (field.arguments?.length ?? 0) > 0
      ) {
        computed.push({ typeName: type.name.value, field });
      } else {
        own.push(field);
      }
    }
    descriptorFields.set(type.name.value, own);
  }
  const typeKinds = new Map(
    [...definitions].map(
      ([name, definition]) => [name, definition.kind] as const,
    ),
  );
  return {
    source,
    types: declarationOrder(types),
    typeKinds,
    scalars,
    roots,
    computed,
    descriptorFields,
    resolveTypes,
    typeEntries: unreachedTypes(definitions, types, roots),
    subscriptionsWithResolve,
  };
}

/**
 * The types no root field reaches, in SDL order, leaving out a type that an
 * earlier one reaches. A code-first subgraph serves a type only through an
 * entry, and nothing leads from an interface to the types that implement it.
 */
function unreachedTypes(
  definitions: ReadonlyMap<string, TypeDefinitionNode>,
  types: readonly TypeDefinitionNode[],
  roots: Partial<Record<RootName, readonly FieldDefinitionNode[]>>,
): readonly string[] {
  const reached = new Set<string>();
  const fieldTypes = (fields: readonly FieldDefinitionNode[]) =>
    fields.flatMap((field) => [
      field.type,
      ...(field.arguments ?? []).map((argument) => argument.type),
    ]);
  const reach = (name: string) => {
    const definition = definitions.get(name);
    if (
      reached.has(name) ||
      definition === undefined ||
      definition.kind === Kind.SCALAR_TYPE_DEFINITION
    ) {
      return;
    }
    reached.add(name);
    switch (definition.kind) {
      case Kind.OBJECT_TYPE_DEFINITION:
      case Kind.INTERFACE_TYPE_DEFINITION:
        (definition.interfaces ?? []).forEach((entry) =>
          reach(entry.name.value),
        );
        fieldTypes(definition.fields ?? []).forEach((type) =>
          reach(namedTypeOf(type)),
        );
        return;
      case Kind.INPUT_OBJECT_TYPE_DEFINITION:
        (definition.fields ?? []).forEach((field) =>
          reach(namedTypeOf(field.type)),
        );
        return;
      case Kind.UNION_TYPE_DEFINITION:
        (definition.types ?? []).forEach((member) => reach(member.name.value));
    }
  };
  for (const fields of Object.values(roots)) {
    fieldTypes(fields).forEach((type) => reach(namedTypeOf(type)));
  }
  return types.flatMap((type) => {
    const name = type.name.value;
    if (reached.has(name)) return [];
    reach(name);
    return [name];
  });
}

const namedTypeOf = (type: TypeNode): string =>
  type.kind === Kind.NAMED_TYPE ? type.name.value : namedTypeOf(type.type);

/**
 * Union members and implemented interfaces must be declared first. Among
 * the types that can come next, the one with the fewest field references to
 * undeclared types does, so few references need a thunk.
 */
function declarationOrder(
  types: readonly TypeDefinitionNode[],
): readonly TypeDefinitionNode[] {
  const names = new Set(types.map((type) => type.name.value));
  const strict = (type: TypeDefinitionNode): string[] =>
    type.kind === Kind.UNION_TYPE_DEFINITION
      ? (type.types ?? []).map((member) => member.name.value)
      : type.kind === Kind.OBJECT_TYPE_DEFINITION ||
          type.kind === Kind.INTERFACE_TYPE_DEFINITION
        ? (type.interfaces ?? []).map((entry) => entry.name.value)
        : [];
  const referenced = (type: TypeDefinitionNode): string[] =>
    type.kind === Kind.OBJECT_TYPE_DEFINITION ||
    type.kind === Kind.INTERFACE_TYPE_DEFINITION ||
    type.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION
      ? (type.fields ?? [])
          .map((field) => namedTypeOf(field.type))
          .filter((name) => names.has(name))
      : [];
  const declared = new Set<string>();
  const order: TypeDefinitionNode[] = [];
  const pending = [...types];
  while (pending.length > 0) {
    const ready = pending.filter((type) =>
      strict(type).every((name) => declared.has(name)),
    );
    const next = ready.reduce((best, type) => {
      const missing = (candidate: TypeDefinitionNode) =>
        referenced(candidate).filter((name) => !declared.has(name)).length;
      return missing(type) < missing(best) ? type : best;
    });
    order.push(next);
    declared.add(next.name.value);
    pending.splice(pending.indexOf(next), 1);
  }
  return order;
}

function description(node: { readonly description?: StringValueNode }) {
  return node.description?.value;
}

function deprecationOf(node: {
  readonly directives?: readonly ConstDirectiveNode[];
}): string | undefined {
  const directive = node.directives?.find(
    (candidate) => candidate.name.value === "deprecated",
  );
  if (directive === undefined) return undefined;
  const reason = directive.arguments?.find(
    (argument) => argument.name.value === "reason",
  )?.value;
  return reason?.kind === Kind.STRING ? reason.value : "No longer supported";
}

function jsonValue(
  node: ConstValueNode,
  refuseAt: (node: Located, reason: string, repair: string) => never,
): Json {
  switch (node.kind) {
    case Kind.INT: {
      const value = Number(node.value);
      if (!Number.isSafeInteger(value)) {
        refuseAt(
          node,
          `The default value ${node.value} is outside the integers JSON keeps exactly.`,
          "Use a smaller default value.",
        );
      }
      return value;
    }
    case Kind.FLOAT:
      return Number(node.value);
    case Kind.STRING:
    case Kind.ENUM:
      return node.value;
    case Kind.BOOLEAN:
      return node.value;
    case Kind.NULL:
      return null;
    case Kind.LIST:
      return node.values.map((value) => jsonValue(value, refuseAt));
    case Kind.OBJECT:
      return Object.fromEntries(
        node.fields.map((field) => [
          field.name.value,
          jsonValue(field.value, refuseAt),
        ]),
      );
  }
}

/** How a backend spells field uses, types and entries. */
type Backend<F, T, E> = {
  scalar(scalar: ScalarKind, options: FieldOptions): F;
  ref(typeName: string, declared: boolean, options: FieldOptions): F;
  list(item: F, options: FieldOptions): F;
  type(
    definition: TypeDefinitionNode,
    members: {
      readonly fields: readonly (readonly [string, F])[];
      readonly values: readonly {
        readonly name: string;
        readonly description?: string;
        readonly deprecated?: string;
      }[];
      readonly related: readonly string[];
    },
    thunked: boolean,
  ): T;
  entry(entry: EntrySpec<F>): E;
};

type EntrySpec<F> =
  | {
      readonly kind: "query" | "mutation" | "subscription" | "computed-field";
      readonly typeName: string;
      readonly fieldName: string;
      readonly description?: string;
      readonly deprecated?: string;
      readonly args: readonly (readonly [string, F])[];
      readonly type: F;
      readonly hasResolve: boolean;
    }
  | { readonly kind: "resolve-type"; readonly typeName: string }
  | { readonly kind: "type"; readonly typeName: string };

/** Walks the model once in declaration order, spelling it with `backend`. */
function walk<F, T, E>(model: Model, backend: Backend<F, T, E>) {
  const refuseAt = (node: Located, reason: string, repair: string): never =>
    refuse(model.source.file, sdlLine(model.source, node), reason, repair);
  const declared = new Set<string>();
  let thunked = false;
  const use = (
    type: TypeNode,
    options: Omit<FieldOptions, "required">,
    outer = true,
  ): F => {
    const required = type.kind === Kind.NON_NULL_TYPE;
    const inner = required ? type.type : type;
    const full: FieldOptions = outer ? { required, ...options } : { required };
    if (inner.kind === Kind.LIST_TYPE) {
      return backend.list(use(inner.type, {}, false), full);
    }
    const name = inner.name.value;
    const scalar = model.scalars.get(name);
    if (scalar !== undefined) return backend.scalar(scalar, full);
    const isDeclared = declared.has(name);
    if (!isDeclared) thunked = true;
    return backend.ref(name, isDeclared, full);
  };
  const inputValue = (
    value: InputValueDefinitionNode,
  ): readonly [string, F] => [
    value.name.value,
    use(value.type, {
      ...(description(value) !== undefined && {
        description: description(value),
      }),
      ...(deprecationOf(value) !== undefined && {
        deprecated: deprecationOf(value),
      }),
      ...(value.defaultValue !== undefined && {
        defaultValue: jsonValue(value.defaultValue, refuseAt),
      }),
    }),
  ];
  const outputField = (field: FieldDefinitionNode): readonly [string, F] => [
    field.name.value,
    use(field.type, {
      ...(description(field) !== undefined && {
        description: description(field),
      }),
      ...(deprecationOf(field) !== undefined && {
        deprecated: deprecationOf(field),
      }),
    }),
  ];
  const types = model.types.map((definition) => {
    thunked = false;
    const name = definition.name.value;
    const fields =
      definition.kind === Kind.OBJECT_TYPE_DEFINITION
        ? (model.descriptorFields.get(name) ?? []).map(outputField)
        : definition.kind === Kind.INTERFACE_TYPE_DEFINITION
          ? (definition.fields ?? []).map(outputField)
          : definition.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION
            ? (definition.fields ?? []).map(inputValue)
            : [];
    const values =
      definition.kind === Kind.ENUM_TYPE_DEFINITION
        ? (definition.values ?? []).map((value) => ({
            name: value.name.value,
            ...(description(value) !== undefined && {
              description: description(value),
            }),
            ...(deprecationOf(value) !== undefined && {
              deprecated: deprecationOf(value),
            }),
          }))
        : [];
    const related =
      definition.kind === Kind.UNION_TYPE_DEFINITION
        ? (definition.types ?? []).map((member) => member.name.value)
        : definition.kind === Kind.OBJECT_TYPE_DEFINITION ||
            definition.kind === Kind.INTERFACE_TYPE_DEFINITION
          ? (definition.interfaces ?? []).map((entry) => entry.name.value)
          : [];
    const fieldsThunked = thunked;
    declared.add(name);
    return backend.type(definition, { fields, values, related }, fieldsThunked);
  });
  const fieldEntry = (
    kind: "query" | "mutation" | "subscription" | "computed-field",
    typeName: string,
    field: FieldDefinitionNode,
  ) =>
    backend.entry({
      kind,
      typeName,
      fieldName: field.name.value,
      ...(description(field) !== undefined && {
        description: description(field),
      }),
      ...(deprecationOf(field) !== undefined && {
        deprecated: deprecationOf(field),
      }),
      args: (field.arguments ?? []).map(inputValue),
      type: use(field.type, {}),
      hasResolve:
        kind !== "subscription" ||
        model.subscriptionsWithResolve.has(field.name.value),
    });
  const entries = [
    ...(Object.keys(ROOT_KINDS) as RootName[]).flatMap((root) =>
      (model.roots[root] ?? []).map((field) =>
        fieldEntry(ROOT_KINDS[root], root, field),
      ),
    ),
    ...model.computed.map(({ typeName, field }) =>
      fieldEntry("computed-field", typeName, field),
    ),
    ...model.resolveTypes.map((typeName) =>
      backend.entry({ kind: "resolve-type", typeName }),
    ),
    ...model.typeEntries.map((typeName) =>
      backend.entry({ kind: "type", typeName }),
    ),
  ];
  return { types, entries };
}

const KIND_BUILDERS: Partial<Record<TypeDefinitionNode["kind"], string>> = {
  [Kind.OBJECT_TYPE_DEFINITION]: "object",
  [Kind.INTERFACE_TYPE_DEFINITION]: "interface",
  [Kind.INPUT_OBJECT_TYPE_DEFINITION]: "input",
  [Kind.ENUM_TYPE_DEFINITION]: "enum",
  [Kind.UNION_TYPE_DEFINITION]: "union",
};

const DESCRIPTOR_TYPES: Partial<Record<TypeDefinitionNode["kind"], string>> = {
  [Kind.OBJECT_TYPE_DEFINITION]: "ObjectDescriptor",
  [Kind.INTERFACE_TYPE_DEFINITION]: "InterfaceDescriptor",
  [Kind.INPUT_OBJECT_TYPE_DEFINITION]: "InputDescriptor",
};

type CodeText = {
  readonly text: string;
  /** Types and project scalars the text names, to import. */
  readonly types: readonly string[];
  readonly scalars: readonly string[];
  readonly annotation?: string;
};

/** Spells the model as the source of `schema.ts` and of the `getSchema` entries. */
/** `local` names a type in the module the text goes into; `schema.ts` uses each type's own name. */
function codeBackend(
  local: (typeName: string) => string = (typeName) => typeName,
): Backend<string, CodeText, CodeText> {
  const literal = (value: Json) => JSON.stringify(value);
  const withOptions = (head: string, field: FieldOptions) => {
    const parts = [
      field.required && "required: true",
      field.description !== undefined &&
        `description: ${literal(field.description)}`,
      field.deprecated !== undefined &&
        `deprecated: ${literal(field.deprecated)}`,
      Object.hasOwn(field, "defaultValue") &&
        `defaultValue: ${literal(field.defaultValue ?? null)}`,
    ].filter(Boolean);
    const options = parts.length === 0 ? "" : `{ ${parts.join(", ")} }`;
    return head === ""
      ? options
      : options === ""
        ? head
        : `${head}, ${options}`;
  };
  // Field uses are spelled before the type or entry that holds them, which
  // then takes what they named.
  let types = new Set<string>();
  let scalars = new Set<string>();
  const take = () => {
    const named = { types: [...types], scalars: [...scalars] };
    types = new Set();
    scalars = new Set();
    return named;
  };
  const members = (entries: readonly (readonly [string, string])[]) =>
    `{ ${entries.map(([key, value]) => `${key}: ${value}`).join(", ")} }`;
  const delegate = (
    path: readonly string[],
    kind: "field" | "type",
    result = "",
  ) =>
    kind === "field"
      ? `({ parent, args, request, info, subgraph }) => subgraph.${DELEGATE_METHOD}${result}(${literal(path)}, parent, args, request, info)`
      : `({ value, request, info, subgraph }) => subgraph.${DELEGATE_METHOD}(${literal(path)}, value, request, info)`;
  return {
    scalar(scalar, field) {
      if (scalar.kind !== "project") {
        return `ph.${scalar.builder}(${withOptions("", field)})`;
      }
      scalars.add(scalar.exportName);
      return `ph.scalar(${withOptions(scalar.exportName, field)})`;
    },
    ref(typeName, declared, field) {
      types.add(typeName);
      const name = local(typeName);
      return `ph.ref(${withOptions(declared ? name : `() => ${name}`, field)})`;
    },
    list(item, field) {
      return `ph.list(${withOptions(item, field)})`;
    },
    type(definition, { fields, values, related }, thunked) {
      const name = definition.name.value;
      const builder = KIND_BUILDERS[definition.kind]!;
      const text = description(definition);
      const parts = text === undefined ? [] : [`description: ${literal(text)}`];
      if (builder === "union") {
        parts.push(`members: [${related.join(", ")}]`);
      } else if (related.length > 0) {
        parts.push(`implements: [${related.join(", ")}]`);
      }
      if (builder === "enum") {
        const spelled = values.map((value) =>
          value.description === undefined && value.deprecated === undefined
            ? literal(value.name)
            : `{ ${[
                `name: ${literal(value.name)}`,
                value.description !== undefined &&
                  `description: ${literal(value.description)}`,
                value.deprecated !== undefined &&
                  `deprecated: ${literal(value.deprecated)}`,
              ]
                .filter(Boolean)
                .join(", ")} }`,
        );
        parts.push(`values: [${spelled.join(", ")}]`);
      } else if (builder !== "union") {
        parts.push(`fields: ${members(fields)}`);
      }
      const annotation = thunked
        ? DESCRIPTOR_TYPES[definition.kind]
        : undefined;
      return {
        text: `export const ${name}${annotation === undefined ? "" : `: ${annotation}`} = ph.${builder}(${literal(name)}, { ${parts.join(", ")} });`,
        ...take(),
        ...(annotation !== undefined && { annotation }),
      };
    },
    entry(entry) {
      if (entry.kind === "type") {
        take();
        return {
          text: `schema.type(${local(entry.typeName)})`,
          types: [entry.typeName],
          scalars: [],
        };
      }
      if (entry.kind === "resolve-type") {
        take();
        return {
          text: `schema.resolveType(${local(entry.typeName)}, ${delegate([entry.typeName, "__resolveType"], "type")})`,
          types: [entry.typeName],
          scalars: [],
        };
      }
      const spec = [
        entry.description !== undefined &&
          `description: ${literal(entry.description)}`,
        entry.deprecated !== undefined &&
          `deprecated: ${literal(entry.deprecated)}`,
        entry.args.length > 0 && `args: ${members(entry.args)}`,
        `type: ${entry.type}`,
      ].filter((part): part is string => typeof part === "string");
      const coordinate = [entry.typeName, entry.fieldName];
      if (entry.kind === "subscription") {
        // With resolve, the events are whatever resolve maps; nothing infers their type.
        spec.push(
          `subscribe: ${delegate([...coordinate, "subscribe"], "field", entry.hasResolve ? "<AsyncIterable<unknown>>" : "")}`,
        );
        if (entry.hasResolve) {
          spec.push(
            `resolve: ${delegate([...coordinate, "resolve"], "field")}`,
          );
        }
      } else {
        spec.push(`resolve: ${delegate(coordinate, "field")}`);
      }
      const head =
        entry.kind === "computed-field"
          ? `schema.field(${local(entry.typeName)}, ${literal(entry.fieldName)}`
          : `schema.${entry.kind}(${literal(entry.fieldName)}`;
      const named = take();
      return {
        text: `${head}, { ${spec.join(", ")} })`,
        types:
          entry.kind === "computed-field"
            ? [...named.types, entry.typeName]
            : named.types,
        scalars: named.scalars,
      };
    },
  };
}

const sortedUnique = (names: Iterable<string>) => [...new Set(names)].sort();

function schemaFileText(model: Model, subgraphName: string): string {
  const { types } = walk(model, codeBackend());
  const annotations = sortedUnique(
    types.flatMap(({ annotation }) =>
      annotation === undefined ? [] : [annotation],
    ),
  );
  const scalars = sortedUnique(types.flatMap((type) => type.scalars));
  if (types.length === 0) {
    return `/**\n * The ${subgraphName} subgraph declares no types of its own.\n */\nexport {};\n`;
  }
  const imports = [
    `import { ${[...annotations.map((name) => `type ${name}`), "ph"].join(", ")} } from "document-model";`,
    ...(scalars.length === 0
      ? []
      : [`import { ${scalars.join(", ")} } from "../../scalars/index.js";`]),
  ];
  return `/**\n * The types of the ${subgraphName} subgraph, as \`ph\` descriptors.\n */\n${imports.join("\n")}\n\n${types.map(({ text }) => text).join("\n\n")}\n`;
}

async function generatedMembers(
  className: string,
  entries: readonly CodeText[],
): Promise<string> {
  // The private field is declared only so the formatter parses the method.
  const formatted = await formatSafe(`class ${className} {
  ${RESOLVERS_FIELD} = {};

  static override getSchema(
    schema: SchemaBuilder<${className}>,
  ): readonly SubgraphSchemaEntry<${className}>[] {
    return [${entries.map((entry) => entry.text).join(",\n")}];
  }

  ${DELEGATE_METHOD}<T>(path: readonly string[], ...args: readonly unknown[]): T {
    let value: unknown = this.${RESOLVERS_FIELD};
    for (const key of path) {
      value = typeof value === "object" && value !== null && Object.hasOwn(value, key) ? (value as Readonly<Record<string, unknown>>)[key] : undefined;
    }
    if (typeof value === "object" && value !== null && "resolve" in value) {
      value = value.resolve;
    }
    const resolver = (typeof value === "function" ? value : defaultFieldResolver) as (...args: readonly unknown[]) => T;
    return resolver(...args);
  }
}
`);
  const lines = formatted.split("\n");
  const start = lines.findIndex((line) =>
    line.includes("static override getSchema"),
  );
  const end = lines.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Formatting the generated members of ${className} failed.`);
  }
  return lines.slice(start, end).join("\n").replace(/\s+$/, "");
}

async function indexFileText(
  index: SourceFile,
  cls: ClassDeclaration,
  members: Members,
  model: Model,
): Promise<string> {
  const className = cls.getNameOrThrow();
  const identifiersBefore = identifierCounts(index);
  const importsReadBefore = importReferences(index);
  const aliases = typeAliases(
    walk(model, codeBackend()).entries.flatMap((entry) => entry.types),
    identifiersBefore,
    localBindings(index),
  );
  const { entries } = walk(
    model,
    codeBackend((typeName) => aliases.get(typeName) ?? typeName),
  );
  const body = await generatedMembers(className, entries);

  const edits: {
    readonly start: number;
    readonly end: number;
    readonly text: string;
  }[] = [];
  const extended = cls.getExtendsOrThrow().getExpression();
  edits.push({
    start: extended.getStart(),
    end: extended.getEnd(),
    text: "Subgraph",
  });
  for (const member of members.removed) {
    const range = { start: member.getStart(), end: member.getEnd() };
    if (member === members.resolvers) {
      const typeNode = member.getTypeNode()?.getText();
      edits.push({
        ...range,
        text: `readonly ${RESOLVERS_FIELD}${typeNode === undefined ? "" : `: ${typeNode}`} = ${member.getInitializerOrThrow().getText()};`,
      });
    } else if (member.getName() === "name") {
      edits.push({
        ...range,
        text: `static override readonly subgraphName = ${JSON.stringify(members.name)};`,
      });
    } else {
      edits.push({
        start: member.getFullStart(),
        end: member.getEnd(),
        text: "",
      });
    }
  }
  let text = index.getFullText();
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }
  index.replaceWithText(text);
  removeOrphanedImports(index, importsReadBefore);

  const imports: readonly (readonly [string, readonly ImportedName[]])[] = [
    [
      REACTOR_API_PACKAGE,
      [
        { name: "Subgraph" },
        { name: "SchemaBuilder", isTypeOnly: true },
        { name: "SubgraphSchemaEntry", isTypeOnly: true },
      ],
    ],
    ["document-model", [{ name: "ph" }]],
    [GRAPHQL_PACKAGE, [{ name: "defaultFieldResolver" }]],
    [
      "./schema.js",
      sortedUnique(entries.flatMap((entry) => entry.types)).map((name) => ({
        name,
        ...(aliases.has(name) && { alias: aliases.get(name) }),
      })),
    ],
    [
      "../../scalars/index.js",
      sortedUnique(entries.flatMap((entry) => entry.scalars)).map((name) => ({
        name,
      })),
    ],
  ];
  const bound = localBindings(index);
  for (const [specifier, names] of imports) {
    for (const { name, alias } of names) {
      const binding = bound.get(alias ?? name);
      if (binding === undefined || binding === `${specifier}#${name}`) continue;
      refuse(
        index.getFilePath().slice(1),
        1,
        `index.ts already declares ${alias ?? name}, a name the code-first subgraph imports from ${specifier}.`,
        `Rename ${alias ?? name} in index.ts.`,
      );
    }
    addNamedImports(index, specifier, names);
  }
  removeEmptyImports(index);
  for (const declaration of index.getImportDeclarations()) {
    const text = declaration.getText();
    if (text.length <= 80) continue;
    declaration.replaceWithText((await formatSafe(text)).trimEnd());
  }
  const target = index.getClassOrThrow(className);
  const lastMember = target.getMembers().at(-1);
  index.insertText(
    lastMember === undefined ? target.getEnd() - 1 : lastMember.getEnd(),
    `\n\n${body}${lastMember === undefined ? "\n" : ""}`,
  );
  return index.getFullText();
}

type ImportedName = {
  readonly name: string;
  readonly alias?: string;
  readonly isTypeOnly?: boolean;
};

/** Names the generated members and imports of `index.ts` bind. */
const GENERATED_NAMES = new Set([
  "Subgraph",
  "SchemaBuilder",
  "SubgraphSchemaEntry",
  "ph",
  "defaultFieldResolver",
  "schema",
  "parent",
  "args",
  "request",
  "info",
  "subgraph",
  "value",
]);

/**
 * An import alias for each type whose own name `index.ts` already uses, or
 * that names a global, so the descriptor shadows nothing the class's code
 * reads, such as `Error` in `throw new Error()`.
 */
function typeAliases(
  typeNames: readonly string[],
  used: ReadonlyMap<string, number>,
  bound: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  const taken = new Set([
    ...used.keys(),
    ...bound.keys(),
    ...GENERATED_NAMES,
    ...typeNames,
  ]);
  const clashes = (name: string) =>
    used.has(name) ||
    (bound.has(name) && bound.get(name) !== `./schema.js#${name}`) ||
    GENERATED_NAMES.has(name) ||
    name in globalThis;
  const aliases = new Map<string, string>();
  for (const name of sortedUnique(typeNames)) {
    if (!clashes(name)) continue;
    let alias = `${name}Type`;
    for (let n = 2; taken.has(alias) || alias in globalThis; n++) {
      alias = `${name}Type${n}`;
    }
    taken.add(alias);
    aliases.set(name, alias);
  }
  return aliases;
}

/** What each top-level name of `file` is bound to: `<specifier>#<import>` for an import. */
function localBindings(file: SourceFile): ReadonlyMap<string, string> {
  const bound = new Map<string, string>();
  for (const declaration of file.getImportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    const defaultImport = declaration.getDefaultImport();
    if (defaultImport !== undefined)
      bound.set(defaultImport.getText(), `${specifier}#default`);
    const namespace = declaration.getNamespaceImport();
    if (namespace !== undefined)
      bound.set(namespace.getText(), `${specifier}#*`);
    for (const named of declaration.getNamedImports()) {
      bound.set(
        (named.getAliasNode() ?? named.getNameNode()).getText(),
        `${specifier}#${named.getName()}`,
      );
    }
  }
  for (const name of [
    ...file.getClasses(),
    ...file.getFunctions(),
    ...file.getInterfaces(),
    ...file.getTypeAliases(),
    ...file.getEnums(),
    ...file.getVariableDeclarations(),
  ].flatMap((declaration) => declaration.getName() ?? [])) {
    bound.set(name, "local");
  }
  return bound;
}

/**
 * Whether an identifier refers to a binding. The name of a property, a
 * property access, a class or interface member, or an enum member does not.
 */
function isReference(identifier: Node): boolean {
  const parent = identifier.getParent();
  if (parent === undefined) return true;
  if (Node.isPropertyAccessExpression(parent)) {
    return parent.getNameNode() !== identifier;
  }
  if (Node.isQualifiedName(parent)) return parent.getRight() !== identifier;
  if (Node.isBindingElement(parent)) {
    return parent.getPropertyNameNode() !== identifier;
  }
  if (
    Node.isPropertyAssignment(parent) ||
    Node.isMethodDeclaration(parent) ||
    Node.isPropertyDeclaration(parent) ||
    Node.isPropertySignature(parent) ||
    Node.isMethodSignature(parent) ||
    Node.isGetAccessorDeclaration(parent) ||
    Node.isSetAccessorDeclaration(parent) ||
    Node.isEnumMember(parent)
  ) {
    return parent.getNameNode() !== identifier;
  }
  return true;
}

/** How often each name is referenced outside the imports. */
function identifierCounts(file: SourceFile): Map<string, number> {
  const counts = new Map<string, number>();
  for (const identifier of file.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (
      identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) ||
      !isReference(identifier)
    )
      continue;
    counts.set(
      identifier.getText(),
      (counts.get(identifier.getText()) ?? 0) + 1,
    );
  }
  return counts;
}

function addNamedImports(
  file: SourceFile,
  specifier: string,
  names: readonly ImportedName[],
) {
  if (names.length === 0) return;
  const existing = file
    .getImportDeclarations()
    .find(
      (declaration) =>
        declaration.getModuleSpecifierValue() === specifier &&
        !declaration.isTypeOnly() &&
        declaration.getNamespaceImport() === undefined,
    );
  const present = new Set(
    existing?.getNamedImports().map((named) => named.getName()) ?? [],
  );
  const missing = names.filter(({ name }) => !present.has(name));
  if (missing.length === 0) return;
  if (existing === undefined) {
    const imports = file.getImportDeclarations();
    file.insertImportDeclaration(
      imports.length === 0 ? 0 : imports.at(-1)!.getChildIndex() + 1,
      { moduleSpecifier: specifier, namedImports: [...missing] },
    );
    return;
  }
  existing.addNamedImports([...missing]);
}

/** Drops each import the conversion left unused; an import that was already unused stays. */
/** How many references outside the imports read each import binding, by its local name. */
function importReferences(file: SourceFile): Map<string, number> {
  const bindings = new Map(
    file.getImportDeclarations().flatMap((declaration) =>
      [
        ...declaration
          .getNamedImports()
          .map((named) => named.getAliasNode() ?? named.getNameNode()),
        declaration.getDefaultImport(),
        declaration.getNamespaceImport(),
      ].flatMap((node) => {
        const symbol = node?.getSymbol();
        return node === undefined || symbol === undefined
          ? []
          : [[symbol, node.getText()] as const];
      }),
    ),
  );
  const counts = new Map<string, number>();
  for (const identifier of file.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration))
      continue;
    const symbol = identifier.getSymbol();
    const name = symbol === undefined ? undefined : bindings.get(symbol);
    if (name !== undefined) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

function removeOrphanedImports(
  file: SourceFile,
  before: ReadonlyMap<string, number>,
) {
  const after = importReferences(file);
  const orphaned = (name: string) =>
    (before.get(name) ?? 0) > 0 && !after.has(name);
  for (const declaration of file.getImportDeclarations()) {
    for (const named of declaration.getNamedImports()) {
      if (orphaned((named.getAliasNode() ?? named.getNameNode()).getText())) {
        named.remove();
      }
    }
    const defaultImport = declaration.getDefaultImport();
    const namespace = declaration.getNamespaceImport();
    if (
      (defaultImport !== undefined || namespace !== undefined) &&
      [defaultImport, namespace].every(
        (binding) => binding === undefined || orphaned(binding.getText()),
      ) &&
      declaration.getNamedImports().length === 0
    ) {
      declaration.remove();
    } else if (
      defaultImport !== undefined &&
      orphaned(defaultImport.getText())
    ) {
      declaration.removeDefaultImport();
    }
  }
}

/** An import the conversion emptied, now that the new names are in. */
function removeEmptyImports(file: SourceFile) {
  for (const declaration of file.getImportDeclarations()) {
    if (
      declaration.getImportClause() !== undefined &&
      declaration.getNamedImports().length === 0 &&
      declaration.getDefaultImport() === undefined &&
      declaration.getNamespaceImport() === undefined
    ) {
      declaration.remove();
    }
  }
}

/**
 * Builds the converted subgraph's descriptors and entries in this process,
 * compiles them as the host does and compares the schema they serve with
 * the schema-first SDL. A project scalar stands in as a scalar of its name.
 */
function checkStaticParity(
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
