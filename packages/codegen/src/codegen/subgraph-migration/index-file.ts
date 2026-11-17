/** Rewrites index.ts into the code-first subgraph class. */
import {
  GRAPHQL_PACKAGE,
  GRAPHQL_TAG_PACKAGE,
  REACTOR_API_PACKAGE,
} from "@powerhousedao/shared/clis";
import { type ClassDeclaration, Node, type SourceFile } from "ts-morph";
import { formatSafe } from "../../utils/format-with-prettier.js";
import { freeName } from "../migration-ast.js";
import type { Model } from "./analysis.js";
import { refuse, sortedUnique } from "./context.js";
import type { InlinedResolvers } from "./inline-resolvers.js";
import { RESERVED_GLOBALS } from "./reserved-globals.js";
import { codeBackend, type CodeText, walk } from "./schema-emission.js";
import {
  addNamedImports,
  identifierCounts,
  type ImportedName,
  importReferences,
  localBindings,
  removeEmptyImports,
  removeOrphanedImports,
  valueImportNames,
} from "./source-imports.js";
import type { Members } from "./subgraph-class.js";

async function generatedMembers(
  className: string,
  entries: readonly CodeText[],
): Promise<string> {
  // The private names the entries call are declared only so the formatter
  // parses them.
  const privates = sortedUnique(
    entries.flatMap((entry) => entry.text.match(/#\w+/g) ?? []),
  );
  const formatted = await formatSafe(`class ${className} {
  ${privates.map((name) => `${name} = 0;`).join("\n")}

  static override getSchema(
    schema: SchemaBuilder<${className}>,
  ): readonly SubgraphSchemaEntry<${className}>[] {
    return [${entries.map((entry) => entry.text).join(",\n")}];
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

export async function indexFileText(
  index: SourceFile,
  cls: ClassDeclaration,
  members: Members,
  model: Model,
  inlined: InlinedResolvers,
): Promise<string> {
  const className = cls.getNameOrThrow();
  const identifiersBefore = identifierCounts(index);
  const importsReadBefore = importReferences(index);
  const importsLiveBefore = valueImportNames(index);
  const aliases = typeAliases(
    walk(model, codeBackend()).entries.flatMap((entry) => entry.types),
    identifiersBefore,
    localBindings(index),
  );
  const { entries } = walk(
    model,
    codeBackend((typeName) => aliases.get(typeName) ?? typeName, inlined.calls),
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
    if (member.getName() === "name") {
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
  const replacedImports = new Set([
    REACTOR_API_PACKAGE,
    GRAPHQL_TAG_PACKAGE,
    ...index
      .getImportDeclarations()
      .map((declaration) => declaration.getModuleSpecifierValue())
      .filter((specifier) =>
        /^\.\/schema(?:\.[cm]?[jt]s|\.graphql)?$/.test(specifier),
      ),
  ]);
  removeOrphanedImports(
    index,
    importsReadBefore,
    replacedImports,
    importsLiveBefore,
  );

  const imports: readonly (readonly [string, readonly ImportedName[]])[] = [
    [
      REACTOR_API_PACKAGE,
      [
        { name: "Subgraph" },
        { name: "SchemaBuilder", isTypeOnly: true },
        { name: "SubgraphSchemaEntry", isTypeOnly: true },
      ],
    ],
    [
      "document-model",
      [
        ...(entries.some((entry) => entry.host)
          ? [{ name: "hostScalars" }]
          : []),
        { name: "ph" },
      ],
    ],
    [
      GRAPHQL_PACKAGE,
      entries.some((entry) => entry.text.includes("defaultFieldResolver("))
        ? [{ name: "defaultFieldResolver" }]
        : [],
    ],
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
  removeEmptyImports(index, replacedImports);
  for (const declaration of index.getImportDeclarations()) {
    const text = declaration.getText();
    if (text.length <= 80) continue;
    declaration.replaceWithText((await formatSafe(text)).trimEnd());
  }
  // getSchema goes after the class's own members, before the resolvers.
  const target = index.getClassOrThrow(className);
  const members_ = target.getMembers();
  const firstMethod = members_.find(
    (candidate) =>
      inlined.firstMethod !== undefined &&
      Node.hasName(candidate) &&
      candidate.getName() === inlined.firstMethod,
  );
  const lastMember = members_.at(-1);
  if (firstMethod !== undefined) {
    index.insertText(firstMethod.getStart(true), `${body.trimStart()}\n\n  `);
  } else {
    index.insertText(
      lastMember === undefined ? target.getEnd() - 1 : lastMember.getEnd(),
      `\n\n${body}${lastMember === undefined ? "\n" : ""}`,
    );
  }
  return index.getFullText();
}

/** Names the generated members and imports of `index.ts` bind. */
const GENERATED_NAMES = new Set([
  "Subgraph",
  "SchemaBuilder",
  "SubgraphSchemaEntry",
  "ph",
  "hostScalars",
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
    RESERVED_GLOBALS.has(name);
  const aliases = new Map<string, string>();
  for (const name of sortedUnique(typeNames)) {
    if (!clashes(name)) continue;
    const alias = freeName(
      {
        has: (candidate) =>
          taken.has(candidate) || RESERVED_GLOBALS.has(candidate),
      },
      `${name}Type`,
    );
    taken.add(alias);
    aliases.set(name, alias);
  }
  return aliases;
}
