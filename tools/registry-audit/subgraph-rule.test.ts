import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  hasDocumentModelsExport,
  hasPackageExport,
  REPO_ROOT,
  spawnWorker,
} from "./lib.js";
import { describe, expect, it } from "vitest";
import { auditSubgraphExports, loadSubgraphExports } from "./subgraph-rule.js";

const protocol = Symbol.for("powerhouse.subgraph");

describe("published class subgraphs", () => {
  it("recognizes inherited cross-copy protocol without constructing or calling it", () => {
    class Base {
      static [protocol]() {
        throw new Error("must not compile");
      }
      constructor() {
        throw new Error("must not construct");
      }
    }
    class NewSubgraph extends Base {
      static subgraphName = "new-subgraph";
    }
    expect(auditSubgraphExports({ NewSubgraph })).toEqual([
      {
        exports: ["NewSubgraph"],
        className: "NewSubgraph",
        classification: "new-style",
        evidence:
          "Own static subgraphName and static powerhouse.subgraph protocol",
        constructed: false,
        constructionRequired: false,
      },
    ]);
  });

  it("recognizes an old BaseSubgraph chain without constructing", () => {
    class BaseSubgraph {
      constructor() {
        throw new Error("requires host");
      }
    }
    class Shared extends BaseSubgraph {}
    class Old extends Shared {}
    Object.defineProperty(Old.prototype, "constructor", {
      value: {
        get name() {
          throw new Error("must not read a non-function constructor's name");
        },
      },
    });
    expect(auditSubgraphExports({ Old })[0]).toMatchObject({
      classification: "old-style",
      constructed: false,
      constructionRequired: false,
    });
  });

  it("recognizes inherited accessors without evaluating them", () => {
    class Shared {
      get name() {
        throw new Error("do not read");
      }
      get typeDefs() {
        throw new Error("do not read");
      }
      get resolvers() {
        throw new Error("do not read");
      }
    }
    class Old extends Shared {}
    expect(auditSubgraphExports({ Old })[0]).toMatchObject({
      classification: "old-style",
      constructed: false,
    });
  });

  it("reports when own instance fields require construction", () => {
    class Old {
      name = "old";
      typeDefs = {};
      resolvers = {};
    }
    expect(auditSubgraphExports({ Old })[0]).toMatchObject({
      classification: "old-style",
      constructed: true,
      constructionRequired: true,
    });
  });

  it("does not treat inherited names or unmarked statics as new-style", () => {
    class Parent {
      static subgraphName = "parent";
      static [protocol]() {}
    }
    class Child extends Parent {}
    class Unmarked {
      static subgraphName = "unmarked";
    }
    expect(
      auditSubgraphExports({ Child, Unmarked }).map((f) => f.classification),
    ).toEqual(["nameless/other", "nameless/other"]);
  });

  it("retains unresolved failures and continues inspecting other exports", () => {
    class NeedsHost {
      constructor() {
        throw new Error("missing host");
      }
    }
    class Other {}
    const findings = auditSubgraphExports({ NeedsHost, Other });
    expect(findings[0]).toMatchObject({
      classification: "nameless/other",
      constructed: false,
      constructionRequired: true,
    });
    expect(findings[0]?.evidence).toContain(
      "missing host. Classification unresolved.",
    );
    expect(findings[1]).toMatchObject({
      className: "Other",
      constructed: true,
      classification: "nameless/other",
    });
  });

  it("flattens namespaces, retains aliases, deduplicates classes and handles cycles", () => {
    class Old {
      name = "old";
      typeDefs = {};
      resolvers = {};
    }
    const namespace: Record<string, unknown> = { Old };
    namespace.cycle = namespace;
    expect(
      auditSubgraphExports({ namespace, Alias: Old, helper: () => 1, data: 1 }),
    ).toEqual([
      {
        exports: ["namespace.Old", "Alias"],
        className: "Old",
        classification: "old-style",
        evidence: "Construction required: instance has name/typeDefs/resolvers",
        constructed: true,
        constructionRequired: true,
      },
    ]);
  });

  it("loads import-only subgraphs from the package scaffold", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "subgraph-rule-"));
    try {
      const pkg = join(cwd, "node_modules", "fixture");
      await mkdir(pkg, { recursive: true });
      await writeFile(
        join(pkg, "package.json"),
        JSON.stringify({
          name: "fixture",
          type: "module",
          exports: { "./subgraphs": { import: "./subgraphs.mjs" } },
        }),
      );
      await writeFile(
        join(pkg, "subgraphs.mjs"),
        'export class Published { static subgraphName = "published"; static [Symbol.for("powerhouse.subgraph")]() {} }',
      );
      expect(await hasDocumentModelsExport(pkg)).toBe(false);
      expect(await hasPackageExport(pkg, "./subgraphs")).toBe(true);
      const worker = await spawnWorker<{
        ok: boolean;
        subgraphs: { classification: string }[];
      }>({
        runner: join(REPO_ROOT, "tools/registry-audit/load-worker.ts"),
        arg: "fixture",
        cwd,
        timeoutMs: 10000,
        sentinel: "__SBLOAD__",
        env: { AUDIT_HAS_SUBGRAPHS: "1", AUDIT_SUBGRAPHS_ONLY: "1" },
      });
      expect(worker.exitCode).toBe(0);
      expect(worker.timedOut).toBe(false);
      expect(worker.result?.ok).toBe(true);
      expect(worker.result?.subgraphs.map((f) => f.classification)).toEqual([
        "new-style",
      ]);
      expect(await loadSubgraphExports("fixture", cwd)).toEqual([
        {
          exports: ["Published"],
          className: "Published",
          classification: "new-style",
          evidence:
            "Own static subgraphName and static powerhouse.subgraph protocol",
          constructed: false,
          constructionRequired: false,
        },
      ]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
