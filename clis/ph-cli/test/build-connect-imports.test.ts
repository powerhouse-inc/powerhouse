// Focused tests for `noConnectImports`, the browser build's guard on imports of
// @powerhousedao/connect, which Connect doesn't share with the packages it loads.

import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { noConnectImports } from "../src/utils/offered-routes-imports.js";

const root = join("/", "project");
const routesDir = join(root, "hosts", "connect", "routes");
const routesEntry = join(root, ".ph", "connect-routes.package.ts");
const report = join(routesDir, "_app", "reports.tsx");
const helper = join(root, "components", "chart.tsx");
const editor = join(root, "editors", "inventory", "editor.tsx");

// Each module's static imports; `buildEnd` walks them from the routes' entry.
function graph(imports: Record<string, string[]>) {
  return {
    getModuleInfo: (id: string) =>
      id in imports
        ? { importedIds: imports[id], dynamicallyImportedIds: [] }
        : null,
    error: (message: string): never => {
      throw new Error(message);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("noConnectImports", () => {
  it("fails an offered route's own import before it resolves", () => {
    const guard = noConnectImports(routesEntry, routesDir);

    expect(() =>
      guard.resolveId("@powerhousedao/connect/layout", report),
    ).toThrow(/reports\.tsx imports "@powerhousedao\/connect\/layout"/);
  });

  it("knows a route file whatever separator its id uses", () => {
    const guard = noConnectImports(
      "C:\\project\\.ph\\connect-routes.package.ts",
      "C:\\project\\hosts\\connect\\routes",
    );

    expect(() =>
      guard.resolveId(
        "@powerhousedao/connect",
        "C:/project/hosts/connect/routes/_app/reports.tsx",
      ),
    ).toThrow(/reports\.tsx imports "@powerhousedao\/connect"/);
  });

  it("fails an import the offered routes reach through another module", () => {
    const guard = noConnectImports(routesEntry, routesDir);
    expect(guard.resolveId("@powerhousedao/connect/generic", helper)).toBe(
      null,
    );

    const modules = graph({
      [routesEntry]: [report],
      [report]: [helper],
      [helper]: [],
    });
    expect(() => guard.buildEnd.call(modules)).toThrow(
      /chart\.tsx imports "@powerhousedao\/connect\/generic"[\s\S]*@powerhousedao\/connect-core\/router/,
    );
  });

  it("warns on an import only the rest of the package reaches", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const guard = noConnectImports(routesEntry, routesDir);
    guard.resolveId("@powerhousedao/connect", editor);

    guard.buildEnd.call(graph({ [routesEntry]: [report], [report]: [] }));

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain(
      `${editor} imports "@powerhousedao/connect"`,
    );
  });

  it("leaves other imports alone", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const guard = noConnectImports(routesEntry, routesDir);

    expect(guard.resolveId("@powerhousedao/connect-core/router", report)).toBe(
      null,
    );
    guard.buildEnd.call(graph({}));

    expect(warn).not.toHaveBeenCalled();
  });
});
