import { readdirSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Node } from "typescript/unstable/ast";
import { SyntaxKind } from "typescript/unstable/ast";
import {
  isExportDeclaration,
  isImportDeclaration,
  isImportTypeNode,
  isStringLiteralLikeNode,
} from "typescript/unstable/ast/is";
import { API } from "typescript/unstable/sync";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFINITION = join(ROOT, "src/definition");

/** What tooling/release/ may import, as paths under src/definition/. */
const RELEASE_MAY_IMPORT = [
  /^tooling\/release\//,
  /^tooling\/[^/]+\.ts$/,
  /^tooling\/report\//,
  /^tooling\/adapters\/types\.ts$/,
  /^tooling\/check\/types\.ts$/,
  /^kernel\//,
];
/** The kernel's shared types, which document-model reads from the shared package. */
const RELEASE_MAY_IMPORT_PACKAGES = new Set([
  "@powerhousedao/shared/document-model",
]);

type Edge = {
  from: string;
  /** The path under src/definition/ of a document-model source file, else the specifier. */
  to: string;
  local: boolean;
  specifier: string;
  typeOnly: boolean;
};

const isBuiltin = (specifier: string) =>
  specifier.startsWith("node:") || builtinModules.includes(specifier);
const isRelease = (path: string) => path.startsWith("tooling/release/");
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

const api = new API({ cwd: ROOT });
let edges: Edge[];

beforeAll(() => {
  const config = join(ROOT, "tsconfig.json");
  const project = api
    .updateSnapshot({ openProject: config })
    .getProject(config)!;
  const fromDefinition = (path: string) =>
    relative(DEFINITION, path).replaceAll("\\", "/");
  // The API reports paths case-folded on case-insensitive file systems.
  const definitionFiles = new Map(
    sourcesIn(DEFINITION).map((path) => [
      path.toLowerCase(),
      fromDefinition(path),
    ]),
  );
  edges = sourcesIn(join(DEFINITION, "tooling")).flatMap((path) => {
    const file = project.program.getSourceFile(path)!;
    const specifiers = file.imports.filter(isStringLiteralLikeNode);
    const symbols = project.checker.getSymbolAtLocation(specifiers);
    return specifiers.map((specifier, index) => {
      const resolved = symbols[index]?.declarations[0]?.path;
      const local =
        resolved === undefined
          ? undefined
          : definitionFiles.get(resolved.toLowerCase());
      return {
        from: fromDefinition(path),
        to: local ?? specifier.text,
        local: local !== undefined,
        specifier: specifier.text,
        typeOnly: isTypeOnlyImport(specifier),
      };
    });
  });
});

afterAll(() => api.close());

describe("document-model tooling/release/", () => {
  it("resolves relative imports to source files", () => {
    expect(edges.map(show)).toContain(
      "tooling/release/release-checks.ts -> tooling/release/checks/host-validation.ts",
    );
  });

  it("imports only root tooling files, report/, adapters and check types, and the kernel", () => {
    const offenders = edges.filter(
      ({ from, to, local, specifier }) =>
        isRelease(from) &&
        (local
          ? !RELEASE_MAY_IMPORT.some((allowed) => allowed.test(to))
          : isBuiltin(specifier) ||
            !RELEASE_MAY_IMPORT_PACKAGES.has(specifier)),
    );
    expect(offenders.map(show)).toEqual([]);
  });

  it("is imported by no other tooling folder", () => {
    const offenders = edges.filter(
      ({ from, to, local }) => local && !isRelease(from) && isRelease(to),
    );
    expect(offenders.map(show)).toEqual([]);
  });
});
