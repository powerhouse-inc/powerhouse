/** Runs the project's tsc over converted subgraphs, and casts the resolver calls it rejects. */
import { type CallExpression, Node, Project, SyntaxKind } from "ts-morph";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, posix, resolve } from "node:path";
import { formatSafe } from "../../utils/format-with-prettier.js";
import {
  stringValue,
  type SubgraphMigrationFile,
  unwrap,
  withLineEndings,
} from "./context.js";

/** @experimental A converted resolver call TypeScript rejects. */
export type ResolverTypeError = {
  /** Project-relative path of the subgraph's index.ts. */
  readonly file: string;
  readonly line: number;
  readonly column: number;
  /** The resolver's coordinate, such as `Query.builders`. */
  readonly coordinate: string;
  readonly message: string;
};

const ENTRY_ROOTS: Readonly<Record<string, string>> = {
  query: "Query",
  mutation: "Mutation",
  subscription: "Subscription",
};

/** @experimental One error the project's tsc reports. */
export type ProjectTypeError = {
  /** Project-relative path. */
  readonly file: string;
  readonly line: number;
  readonly column: number;
  /** The message chain, most general line first. */
  readonly lines: readonly string[];
};

/** @experimental What the project's tsc reported, or why it was not run. */
export type ProjectTypeCheck =
  | { readonly kind: "checked"; readonly errors: readonly ProjectTypeError[] }
  /** The project has no tsconfig.json or no TypeScript, so nothing checks it. */
  | { readonly kind: "untyped" }
  /** tsc could not check what was asked. */
  | { readonly kind: "skipped"; readonly reason: string };

/**
 * @experimental Runs the project's own tsc against its tsconfig.json, and
 * returns the errors in `dirs` (project-relative). A project without a
 * tsconfig.json or TypeScript is untyped; the check is skipped when tsc
 * does not run or does not check each of `files`.
 */
export function projectTypeErrors(
  projectDir: string,
  dirs: readonly string[],
  files: readonly string[],
): ProjectTypeCheck {
  const root = realpathSync(projectDir);
  let tsconfig: string | undefined;
  for (let dir = root; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "tsconfig.json"))) {
      tsconfig = join(dir, "tsconfig.json");
      break;
    }
    if (dirname(dir) === dir) {
      return { kind: "untyped" };
    }
  }
  let tsc: string;
  try {
    const require = createRequire(join(root, "package.json"));
    const manifest = require.resolve("typescript/package.json");
    const { bin } = JSON.parse(readFileSync(manifest, "utf8")) as {
      bin?: string | Readonly<Record<string, string>>;
    };
    const entry = typeof bin === "string" ? bin : bin?.tsc;
    if (entry === undefined) throw new Error("no tsc");
    tsc = join(dirname(manifest), entry);
  } catch {
    return { kind: "untyped" };
  }
  const cwd = dirname(tsconfig);
  const run = spawnSync(
    process.execPath,
    [tsc, "--noEmit", "--pretty", "false", "--listFiles", "-p", tsconfig],
    { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  if (run.error !== undefined) {
    return { kind: "skipped", reason: `tsc did not run: ${run.error.message}` };
  }
  // tsc prints `file(line,col): error TSnnnn: message`, a message chain's
  // later lines indented below it, and each file it checked.
  const relative = (path: string) =>
    posix.relative(root.replaceAll("\\", "/"), path.replaceAll("\\", "/"));
  const errors: ProjectTypeError[] = [];
  const listed = new Set<string>();
  let last: { lines: string[] } | undefined;
  for (const text of run.stdout.split(/\r?\n/)) {
    const error = /^(.+?)\((\d+),(\d+)\): error TS\d+: (.*)$/.exec(text);
    if (error !== null) {
      const entry = {
        file: relative(resolve(cwd, error[1])),
        line: Number(error[2]),
        column: Number(error[3]),
        lines: [error[4]],
      };
      errors.push(entry);
      last = entry;
    } else if (/^\s+\S/.test(text) && last !== undefined) {
      last.lines.push(text.trim());
    } else if (text.trim() !== "") {
      listed.add(relative(resolve(cwd, text.trim())));
      last = undefined;
    }
  }
  const unchecked = files.find((file) => !listed.has(file));
  if (unchecked !== undefined) {
    return {
      kind: "skipped",
      reason: `${relative(tsconfig)} does not check ${unchecked}`,
    };
  }
  return {
    kind: "checked",
    errors: errors.filter((error) =>
      dirs.some((dir) => error.file.startsWith(`${dir}/`)),
    ),
  };
}

/**
 * @experimental The errors among `errors` in the `getSchema` of the
 * converted subgraphs whose index.ts files are `indexPaths`: the resolvers
 * whose own types disagree with the schema they now serve, which the
 * schema-first map never checked.
 */
export function resolverCallErrors(
  projectDir: string,
  indexPaths: readonly string[],
  errors: readonly ProjectTypeError[],
): ResolverTypeError[] {
  const found: ResolverTypeError[] = [];
  const parser = new Project({ useInMemoryFileSystem: true });
  for (const path of indexPaths) {
    const own = errors.filter((error) => error.file === path);
    if (own.length === 0) continue;
    // The lines of each static getSchema, and of each entry in it.
    const file = parser.createSourceFile(
      `/${path}`,
      readFileSync(join(projectDir, path), "utf8"),
      { overwrite: true },
    );
    const schemas = file
      .getClasses()
      .flatMap((cls) => cls.getStaticMethod("getSchema") ?? []);
    const entries = schemas.flatMap((method) =>
      method.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap((call) => {
        const kind =
          /^schema\.(query|mutation|subscription|field|resolveType)$/.exec(
            call.getExpression().getText(),
          )?.[1];
        if (kind === undefined) return [];
        const [first, second] = call.getArguments();
        const name = (node: Node | undefined) =>
          node === undefined ? "?" : (stringValue(node) ?? node.getText());
        return [
          {
            start: call.getStartLineNumber(),
            end: call.getEndLineNumber(),
            coordinate:
              kind === "field"
                ? `${name(first)}.${name(second)}`
                : kind === "resolveType"
                  ? `${name(first)}.__resolveType`
                  : `${ENTRY_ROOTS[kind]}.${name(first)}`,
          },
        ];
      }),
    );
    for (const error of own) {
      const inSchema = schemas.some(
        (method) =>
          method.getStartLineNumber() <= error.line &&
          error.line <= method.getEndLineNumber(),
      );
      if (!inSchema) continue;
      const entry = entries
        .filter((range) => range.start <= error.line && error.line <= range.end)
        .at(-1);
      found.push({
        file: path,
        line: error.line,
        column: error.column,
        coordinate: entry?.coordinate ?? "getSchema",
        message: typeErrorMessage(error),
      });
    }
    parser.removeSourceFile(file);
  }
  return found;
}

/** A tsc error's most specific lines, with each long type cut. */
export function typeErrorMessage(error: ProjectTypeError): string {
  return error.lines
    .slice(-2)
    .join(" ")
    .replace(/'([^']{60})[^']+'/g, "'$1…'");
}

/**
 * @experimental Marks each resolver call in `errors` with a cast, so the
 * converted project compiles and each call runs as the schema-first map ran
 * it: an argument TypeScript rejects is cast where it is passed, a rejected
 * result where it is returned, under a `// ph migrate:` comment naming the
 * disagreement to fix. Returns the files it changed.
 */
export async function castResolverTypeErrors(
  projectDir: string,
  errors: readonly ResolverTypeError[],
): Promise<SubgraphMigrationFile[]> {
  const files: SubgraphMigrationFile[] = [];
  const parser = new Project({ useInMemoryFileSystem: true });
  for (const path of new Set(errors.map((error) => error.file))) {
    const before = readFileSync(join(projectDir, path), "utf8");
    const file = parser.createSourceFile(`/${path}`, before, {
      overwrite: true,
    });
    const casts = new Set<number>();
    const tails = new Map<number, { end: number; text: string }>();
    const comments = new Map<number, Set<string>>();
    for (const error of errors.filter((candidate) => candidate.file === path)) {
      const position = file.compilerNode.getPositionOfLineAndCharacter(
        error.line - 1,
        error.column - 1,
      );
      const node = file.getDescendantAtPos(position);
      // The callback of the entry: the resolve, subscribe or resolveType
      // arrow function whose body calls the resolver.
      const property = node?.getFirstAncestor(
        (ancestor) =>
          Node.isPropertyAssignment(ancestor) &&
          ["resolve", "subscribe"].includes(ancestor.getName()),
      );
      const callback = Node.isPropertyAssignment(property)
        ? property.getInitializer()
        : node?.getFirstAncestor(
            (ancestor) =>
              Node.isArrowFunction(ancestor) &&
              Node.isCallExpression(ancestor.getParent()) &&
              /^schema\.resolveType$/.test(
                (ancestor.getParent() as CallExpression)
                  .getExpression()
                  .getText(),
              ),
          );
      if (callback === undefined || !Node.isArrowFunction(callback)) continue;
      const body = unwrap(callback.getBody());
      const expected =
        /^Expected (?:\d+-)?(\d+) arguments?, but got \d+\./.exec(
          error.message,
        );
      if (expected !== null && Node.isCallExpression(body)) {
        const extra = body.getArguments().slice(Number(expected[1]));
        const first = extra.at(0);
        const last = extra.at(-1);
        if (first !== undefined && last !== undefined) {
          tails.set(first.getStart(), {
            end: last.getEnd(),
            text: `...([${extra.map((arg) => arg.getText()).join(", ")}] as unknown as [])`,
          });
          const at = callback.getBody().getStart();
          comments.set(at, (comments.get(at) ?? new Set()).add(error.message));
          continue;
        }
      }
      const argument = Node.isCallExpression(body)
        ? body
            .getArguments()
            .find(
              (candidate) =>
                candidate.getStart() <= position &&
                position < candidate.getEnd(),
            )
        : undefined;
      casts.add((argument ?? callback.getBody()).getEnd());
      const at = callback.getBody().getStart();
      comments.set(at, (comments.get(at) ?? new Set()).add(error.message));
    }
    const edits = [
      ...[...casts].map((at) => ({ at, end: at, text: " as never" })),
      ...[...tails].map(([at, tail]) => ({ at, ...tail })),
      ...[...comments].map(([at, messages]) => ({
        at,
        end: at,
        text: `\n// ph migrate: the resolver's types disagree with the schema (${[...messages].join("; ")}). The schema-first map never checked them, and this cast keeps its behaviour; fix the resolver's types, then remove the cast.\n`,
      })),
    ].sort((left, right) => right.at - left.at);
    let after = before;
    for (const { at, end, text } of edits) {
      after = after.slice(0, at) + text + after.slice(end);
    }
    parser.removeSourceFile(file);
    if (after === before) continue;
    files.push({
      path,
      before,
      after: withLineEndings(await formatSafe(after), before),
    });
  }
  return files;
}
