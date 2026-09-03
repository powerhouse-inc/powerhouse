import { describe, expect, it } from "vitest";
import {
  formatCiReport,
  owningPackage,
  planCi,
  touchesReactor,
} from "../../bench/fix/fix-ci.js";
import type { CiStep, Coverage, StepOutcome } from "../../bench/fix/fix-ci.js";

const root = "/repo";
const packages = [
  { name: "@powerhousedao/reactor", path: "/repo/packages/reactor" },
  { name: "@powerhousedao/shared", path: "/repo/packages/shared" },
  { name: "@powerhousedao/switchboard", path: "/repo/apps/switchboard" },
];

describe("touchesReactor", () => {
  it("follows check-pr-reactor's path filter", () => {
    expect(touchesReactor(["packages/reactor/src/x.ts"])).toBe(true);
    expect(touchesReactor(["packages/reactor-api/src/x.ts"])).toBe(true);
    expect(touchesReactor(["test/test-connect/src/x.ts"])).toBe(true);
    expect(touchesReactor(["packages/shared/document-model/reducer.ts"])).toBe(
      false,
    );
    expect(touchesReactor(["packages/reactor-browser/src/x.ts"])).toBe(false);
  });
});

describe("owningPackage", () => {
  it("picks the nearest package directory above the file", () => {
    expect(
      owningPackage(root, packages, "packages/reactor/src/cache/a.ts"),
    ).toBe("@powerhousedao/reactor");
    expect(owningPackage(root, packages, "apps/switchboard/test/a.ts")).toBe(
      "@powerhousedao/switchboard",
    );
    expect(owningPackage(root, packages, "README.md")).toBeUndefined();
  });
});

describe("planCi", () => {
  const base = {
    changed: ["packages/shared/document-model/reducer.ts"],
    owners: ["@powerhousedao/shared"],
    stale: [],
    integration: false,
    postgres: true,
  };

  it("mirrors check-commit in order for a change outside the reactor", () => {
    expect(planCi(base).map((step) => step.id)).toEqual([
      "ts-references",
      "build",
      "typecheck",
      "rebuild",
      "versioned-documents",
      "eslint",
      "test-ci",
      "circular",
    ]);
  });

  it("rebuilds stale packages alongside the owners, deduplicated and sorted", () => {
    const build = planCi({
      ...base,
      stale: ["@powerhousedao/reactor-api", "@powerhousedao/shared"],
    }).find((step) => step.id === "build");
    expect(build?.command).toEqual([
      "pnpm",
      "--filter=@powerhousedao/reactor-api",
      "--filter=@powerhousedao/shared",
      "run",
      "build",
    ]);
    expect(build?.blocking).toBe(true);
  });

  it("adds the reactor steps for reactor paths, with Postgres only when reachable", () => {
    const reactor = planCi({
      ...base,
      changed: ["packages/reactor/src/cache/kysely-write-cache.ts"],
      owners: ["@powerhousedao/reactor"],
    });
    expect(reactor.map((step) => step.id).slice(-2)).toEqual([
      "reactor-lint",
      "test-reactor",
    ]);
    const suite = reactor.find((step) => step.id === "test-reactor");
    expect(suite?.env.REACTOR_TEST_PG_URL).toContain("5433");
    expect(suite?.label).toContain("with PG variants");

    const noPg = planCi({
      ...base,
      changed: ["packages/reactor/src/x.ts"],
      postgres: false,
    }).find((step) => step.id === "test-reactor");
    expect(noPg?.env).toEqual({});
    expect(noPg?.label).toContain("NOT run");
  });

  it("runs integration only when asked and only for reactor paths", () => {
    expect(
      planCi({ ...base, integration: true }).some(
        (step) => step.id === "test-integration",
      ),
    ).toBe(false);
    expect(
      planCi({
        ...base,
        changed: ["packages/reactor/src/x.ts"],
        integration: true,
      }).at(-1)?.id,
    ).toBe("test-integration");
  });

  it("lints only lintable files and passes every changed path to test:ci", () => {
    const plan = planCi({
      ...base,
      changed: ["packages/shared/a.ts", "packages/shared/README.md"],
    });
    expect(
      plan.find((step) => step.id === "eslint")?.command.slice(-1),
    ).toEqual(["packages/shared/a.ts"]);
    expect(
      plan.find((step) => step.id === "test-ci")?.command.slice(-2),
    ).toEqual(["packages/shared/a.ts", "packages/shared/README.md"]);
  });
});

describe("formatCiReport", () => {
  const step = (id: string): CiStep => ({
    id,
    label: id,
    command: ["pnpm", id],
    env: {},
    blocking: false,
  });
  const outcome = (
    id: string,
    exit: number | null,
    skipped = false,
  ): StepOutcome => ({
    step: step(id),
    exit,
    signal: null,
    seconds: skipped ? 0 : 3.2,
    log: `/tmp/${id}.log`,
    skipped,
    tail:
      exit === 0 || exit === null ? [] : ["FAIL src/a.test.ts", "expected 1"],
  });
  const coverage: Coverage = {
    changed: ["a.ts"],
    owners: ["@powerhousedao/reactor"],
    rebuilt: ["@powerhousedao/reactor"],
    reactorTouched: true,
    postgres: false,
    integration: false,
    notRun: ["storybook build"],
  };

  it("tables every step, excerpts the red ones, and states the gaps", () => {
    const lines = formatCiReport(
      [
        outcome("typecheck", 0),
        outcome("test-ci", 1),
        outcome("circular", null, true),
      ],
      coverage,
      "/tmp/summary.json",
    );
    expect(lines[2]).toBe(
      "| 1 | typecheck | `pnpm typecheck` | 0 | 3 | pass |",
    );
    expect(lines[3]).toContain("| 1 | 3 | FAIL |");
    expect(lines[4]).toContain("| - | 0 | skipped |");
    expect(lines).toContain("### test-ci exited 1 (/tmp/test-ci.log)");
    expect(lines).toContain("FAIL src/a.test.ts");
    expect(
      lines.some((line) => line.includes("PG variants not run - PARTIAL")),
    ).toBe(true);
    expect(lines.at(-1)).toBe("- summary: /tmp/summary.json");
  });
});
