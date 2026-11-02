// `ph-cli generate connect-routes`, which npm run tsc and lint run first, fails
// on the imports of Connect that would fail `ph build`.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkOfferedRoutesImports } from "../src/utils/offered-routes-imports.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
});

// A project with these files, and the offered-routes module `ph-cli generate
// connect-routes` writes for an offered `_app/reports.tsx`.
function project(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "ph-offered-routes-"));
  dirs.push(root);
  const all: Record<string, string> = {
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        module: "nodenext",
        jsx: "react-jsx",
        paths: { "editors/*": ["./editors/*/index.ts"] },
      },
    }),
    ".ph/connect-routes.package.ts": [
      'import type { PackageRoute } from "@powerhousedao/connect-core/router";',
      'import { Route as r0 } from "../hosts/connect/routes/_app/reports.js";',
      "export const connectRoutes: PackageRoute[] = [{ route: r0, id: '/_app/reports', path: '/reports', parentId: '/_app' }];",
    ].join("\n"),
    ...files,
  };
  for (const [file, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}

const route = (imports: string) =>
  `${imports}\nexport const Route = { component: () => <ModalDialog /> };\n`;

describe("checkOfferedRoutesImports", () => {
  it("fails an offered route that imports Connect, naming connect-core", async () => {
    const root = project({
      "hosts/connect/routes/_app/reports.tsx": route(
        'import { ModalDialog } from "@powerhousedao/connect/layout";',
      ),
    });

    await expect(checkOfferedRoutesImports(root)).rejects.toThrow(
      /reports\.tsx imports "@powerhousedao\/connect\/layout"\. .*ModalDialog.* from @powerhousedao\/connect-core\/router/,
    );
  });

  it("fails an import of Connect the route reaches through the project's modules", async () => {
    const root = project({
      "hosts/connect/routes/_app/reports.tsx": route(
        'import { ModalDialog } from "../../ui/frame.js";\nimport "editors/chart";',
      ),
      "hosts/connect/ui/frame.tsx":
        'export { ModalDialog } from "@powerhousedao/connect-core/router";\n',
      "editors/chart/index.ts":
        'export { SidebarItem } from "@powerhousedao/connect/layout";\n',
    });

    await expect(checkOfferedRoutesImports(root)).rejects.toThrow(
      /editors[\\/]chart[\\/]index\.ts imports "@powerhousedao\/connect\/layout"/,
    );
  });

  it("passes routes that import connect-core, and leaves _app.tsx and overrides alone", async () => {
    const root = project({
      "hosts/connect/routes/_app/reports.tsx": route(
        'import { ModalDialog } from "@powerhousedao/connect-core/router";\nimport "./reports.css";',
      ),
      "hosts/connect/routes/_app/reports.css": "h1 { color: red }",
      // Not offered, so not in the module: they may use Connect.
      "hosts/connect/routes/_app.tsx":
        'import { ContentOutlet } from "@powerhousedao/connect/layout";\n',
      "hosts/connect/routes/_app/index.tsx":
        'import { options } from "@powerhousedao/connect/routes/_app/index";\n',
    });

    await expect(checkOfferedRoutesImports(root)).resolves.toBeUndefined();
  });

  it("leaves a file that won't parse to tsc", async () => {
    const root = project({
      "hosts/connect/routes/_app/reports.tsx": "export const Route = {",
    });

    await expect(checkOfferedRoutesImports(root)).resolves.toBeUndefined();
  });

  it("does nothing for a package that offers no routes", async () => {
    const root = mkdtempSync(join(tmpdir(), "ph-offered-routes-"));
    dirs.push(root);

    await expect(checkOfferedRoutesImports(root)).resolves.toBeUndefined();
  });
});
