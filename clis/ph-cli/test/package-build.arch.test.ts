import { readdirSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Node, SourceFile } from "typescript/unstable/ast";
import { SyntaxKind } from "typescript/unstable/ast";
import {
  isExportDeclaration,
  isIdentifier,
  isImportDeclaration,
  isImportTypeNode,
  isPropertyAccessExpression,
  isStringLiteralLikeNode,
} from "typescript/unstable/ast/is";
import { API, type Project } from "typescript/unstable/sync";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");

/** Rank per the PR 6 module map: a file imports only its own rank or lower. */
const RANKS: [RegExp, number][] = [
  [/^services\/package-build\/pipeline\//, 0],
  [/^services\/package-build\/staging\/inventory\.ts$/, 0],
  [/^services\/compiler-output\//, 0],
  [
    /^services\/release\/(revision|approval|issuance|npm-args|scalar-bindings)\.ts$/,
    0,
  ],
  [/^services\/package-build\/staging\//, 1],
  [/^services\/release\//, 1],
  [/^services\/package-build\/steps\//, 2],
  [/^services\/model\//, 2],
  [/^services\/(package-build\/run-build|build)\.ts$/, 3],
  [/^commands\//, 4],
];

const PURE_BUILTINS = new Set(["node:path", "node:crypto"]);

type Edge = {
  from: string;
  /** The src-relative path of a ph-cli source file, else the specifier. */
  to: string;
  local: boolean;
  /** The file TypeScript resolved the specifier to, if any. */
  resolved?: string;
  specifier: string;
  typeOnly: boolean;
};

const rankOf = (path: string) =>
  RANKS.find(([pattern]) => pattern.test(path))?.[1];
const isPure = (path: string) => rankOf(path) === 0;
const isBuiltin = (specifier: string) =>
  specifier.startsWith("node:") || builtinModules.includes(specifier);
const show = ({ from, to, typeOnly }: Edge) =>
  `${from} -> ${to}${typeOnly ? " (type)" : ""}`;

function sourcesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourcesIn(join(dir, entry.name))
      : /\.m?ts$/.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  );
}

/** `import type`, `export type` and `import("x").T`; verbatimModuleSyntax keeps every other import. */
function isTypeOnlyImport(specifier: Node): boolean {
  const parent = specifier.parent;
  if (isImportDeclaration(parent)) {
    return parent.importClause?.phaseModifier === SyntaxKind.TypeKeyword;
  }
  if (isExportDeclaration(parent)) return parent.isTypeOnly;
  return isImportTypeNode(parent.parent);
}

function descendants(node: Node): Node[] {
  const nodes: Node[] = [];
  node.forEachChild((child) => {
    nodes.push(child, ...descendants(child));
  });
  return nodes;
}

/** How often `file` reads the global `process` that @types/node declares. */
function globalProcessReads(project: Project, file: SourceFile): number {
  const candidates = descendants(file).filter(
    (node) =>
      isIdentifier(node) &&
      node.text === "process" &&
      !(isPropertyAccessExpression(node.parent) && node.parent.name === node),
  );
  if (candidates.length === 0) return 0;
  return project.checker
    .getSymbolAtLocation(candidates)
    .filter((symbol) =>
      symbol?.declarations.some((declaration) =>
        declaration.path.includes("/@types/node/"),
      ),
    ).length;
}

const api = new API({ cwd: ROOT });
let files: string[];
let edges: Edge[];

beforeAll(() => {
  const snapshot = api.updateSnapshot({
    openProject: join(ROOT, "tsconfig.json"),
  });
  const project = snapshot.getProject(join(ROOT, "tsconfig.json"))!;
  const absolute = [
    ...sourcesIn(join(SRC, "services/package-build")),
    ...sourcesIn(join(SRC, "services/release")),
    ...sourcesIn(join(SRC, "services/compiler-output")),
    ...sourcesIn(join(SRC, "services/model")),
    join(SRC, "services/build.ts"),
    ...sourcesIn(join(SRC, "commands")),
  ];
  const fromSrc = (path: string) => relative(SRC, path).replaceAll("\\", "/");
  files = absolute.map(fromSrc);
  // The API reports paths case-folded on case-insensitive file systems.
  const srcFiles = new Map(
    sourcesIn(SRC).map((path) => [path.toLowerCase(), fromSrc(path)]),
  );
  edges = [];
  for (const path of absolute) {
    const file = project.program.getSourceFile(path)!;
    const from = fromSrc(path);
    const specifiers = file.imports.filter(isStringLiteralLikeNode);
    const symbols = project.checker.getSymbolAtLocation(specifiers);
    specifiers.forEach((specifier, index) => {
      const resolved = symbols[index]?.declarations[0]?.path;
      const local =
        resolved === undefined
          ? undefined
          : srcFiles.get(resolved.toLowerCase());
      edges.push({
        from,
        to: local ?? specifier.text,
        local: local !== undefined,
        resolved,
        specifier: specifier.text,
        typeOnly: isTypeOnlyImport(specifier),
      });
    });
    // A read of the global `process` counts as an import of "process".
    const reads = isPure(from) ? globalProcessReads(project, file) : 0;
    for (let read = 0; read < reads; read += 1) {
      edges.push({
        from,
        to: "global process",
        local: false,
        specifier: "process",
        typeOnly: false,
      });
    }
  }
});

afterAll(() => api.close());

describe("package-build, release and compiler-output layers", () => {
  it("ranks every file and resolves relative imports to source files", () => {
    expect(files.filter((path) => rankOf(path) === undefined)).toEqual([]);
    expect(edges.map(show)).toContain(
      "services/build.ts -> services/package-build/run-build.ts",
    );
  });

  it("never imports a higher rank", () => {
    const offenders = edges.filter(
      ({ from, to, local }) =>
        local && (rankOf(to) ?? -1) > (rankOf(from) ?? Infinity),
    );
    expect(offenders.map(show)).toEqual([]);
  });

  it("keeps staging below steps, the pipeline, release and model", () => {
    const offenders = edges.filter(
      ({ from, to, local }) =>
        local &&
        from.startsWith("services/package-build/staging/") &&
        /^services\/(package-build\/(steps|pipeline)\/|package-build\/run-build\.ts|build\.ts|release\/|model\/)/.test(
          to,
        ),
    );
    expect(offenders.map(show)).toEqual([]);
  });

  it("keeps release below package-build, model and commands", () => {
    const offenders = edges.filter(
      ({ from, to, local }) =>
        local &&
        from.startsWith("services/release/") &&
        /^(services\/(package-build\/|model\/|build\.ts)|commands\/)/.test(to),
    );
    expect(offenders.map(show)).toEqual([]);
  });

  it("keeps model below package-build", () => {
    const offenders = edges.filter(
      ({ from, to, local }) =>
        local &&
        from.startsWith("services/model/") &&
        /^services\/(package-build\/|build\.ts)/.test(to),
    );
    expect(offenders.map(show)).toEqual([]);
  });

  it("imports no subgraph module from package-build or release", () => {
    const offenders = edges.filter(
      ({ from, resolved, specifier }) =>
        /^services\/(package-build|release)\//.test(from) &&
        /subgraph/i.test(resolved ?? specifier),
    );
    expect(offenders.map(show)).toEqual([]);
  });

  it("keeps pure files free of Node I/O and process state", () => {
    const offenders = edges.filter(
      ({ from, to, local, specifier }) =>
        isPure(from) &&
        (local
          ? !isPure(to)
          : isBuiltin(specifier) && !PURE_BUILTINS.has(specifier)),
    );
    expect(offenders.map(show)).toEqual([]);
  });

  it("has no value-import cycle", () => {
    const valueEdges = edges.filter(
      ({ local, typeOnly, to }) => local && !typeOnly && files.includes(to),
    );
    const component = stronglyConnected(files, valueEdges);
    const offenders = valueEdges.filter(
      ({ from, to }) =>
        from !== to && component.get(from) === component.get(to),
    );
    expect(offenders.map(show)).toEqual([]);
  });
});

/** Tarjan's strongly connected components: file to component id. */
function stronglyConnected(nodes: string[], links: Edge[]) {
  const next = new Map<string, string[]>();
  for (const { from, to } of links) {
    next.set(from, [...(next.get(from) ?? []), to]);
  }
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const component = new Map<string, number>();
  const stack: string[] = [];
  let counter = 0;
  const visit = (node: string) => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    for (const target of next.get(node) ?? []) {
      if (!index.has(target)) {
        visit(target);
        low.set(node, Math.min(low.get(node)!, low.get(target)!));
      } else if (!component.has(target)) {
        low.set(node, Math.min(low.get(node)!, index.get(target)!));
      }
    }
    if (low.get(node) === index.get(node)) {
      let member: string;
      do {
        member = stack.pop()!;
        component.set(member, index.get(node)!);
      } while (member !== node);
    }
  };
  for (const node of nodes) if (!index.has(node)) visit(node);
  return component;
}
