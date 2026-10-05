import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderSchemaFiles, schemaFilePath } from "../scripts/gen-schemas.js";
import { PROMPTS_ROOT } from "../src/lib/paths.js";
import {
  buildBuilderPrompts,
  buildJudgePrompt,
  buildVerifierPrompt,
  loadPrompt,
  placeholders,
  renderContract,
  renderTemplate,
} from "../src/lib/prompts.js";
import type { Finding } from "../src/lib/schemas.js";

const task = {
  title: "Custom read model",
  taskPrompt: "Build a read model that counts documents.",
  contract: [
    {
      file: "src/document-count-read-model.ts",
      exports: ["DocumentCountReadModel"],
    },
    { file: "src/index.ts", exports: [] },
  ],
};

const finding: Finding = {
  kind: "WRONG",
  docPath: "04-Reference/01-Reactor/read-models.md",
  line: 12,
  quote: ".withReadModel(new DocumentCountReadModel())",
  symbol: "ReactorBuilder.withReadModel",
  claim: "takes a factory",
  evidence: [{ turn: 3, uuid: null }],
  proposedEdit: "use a factory",
  confidence: 0.7,
};

const judgeVars = {
  taskId: "custom-read-model",
  arm: "A" as const,
  pin: "6.2.2-dev.62",
  docsDir: "/run/docs",
  docsIndex: "/run/docs/INDEX.md",
  dtsDir: "/run/t/A/1/dts",
  metricsPath: "/run/t/A/1/metrics.json",
  compactPath: "/run/t/A/1/transcript.compact.md",
  testsPath: "/run/t/A/1/tests.json",
};

describe("renderTemplate", () => {
  it("substitutes every placeholder", () => {
    expect(renderTemplate("a {{x}} b {{ y }} {{x}}", { x: "1", y: "2" })).toBe(
      "a 1 b 2 1",
    );
  });

  it("throws on a placeholder without a value", () => {
    expect(() => renderTemplate("{{x}} {{missing}}", { x: "1" })).toThrow(
      /missing values for: missing/,
    );
  });

  it("lists placeholders once each, in order", () => {
    expect(placeholders("{{b}} {{a}} {{b}}")).toEqual(["b", "a"]);
  });
});

describe("templates", () => {
  const templates = readdirSync(PROMPTS_ROOT).filter((f) => f.endsWith(".md"));

  it("exist for every role", () => {
    expect(templates.sort()).toEqual([
      "builder.reference.md",
      "builder.system.md",
      "builder.task.md",
      "judge.reference.md",
      "judge.system.md",
      "judge.task.md",
      "verifier.system.md",
      "verifier.task.md",
    ]);
  });

  it("contain no em dashes", () => {
    for (const file of templates) {
      expect(loadPrompt(file.replace(/\.md$/, ""))).not.toMatch(/\u2014/);
    }
  });

  it("have every placeholder supplied by a builder function (arm A and B)", () => {
    // Rendering throws on any unsupplied placeholder, and no {{ may survive.
    const rendered = [
      buildBuilderPrompts(task, {
        docsDir: "/d",
        pin: "p",
        workspaceDir: "/w",
        arm: "A",
      }),
      buildBuilderPrompts(task, {
        docsDir: "/d",
        pin: "p",
        workspaceDir: "/w",
        arm: "B",
        referenceDir: "/w/reference",
      }),
      buildJudgePrompt(task, judgeVars),
      buildJudgePrompt(task, { ...judgeVars, arm: "B", referenceDir: "/ref" }),
      buildVerifierPrompt({
        taskId: "t",
        arm: "A",
        pin: "p",
        workspaceDir: "/w",
        docsDir: "/d",
        compactPath: "/c.md",
        findings: [{ index: 0, finding }],
      }),
    ];
    for (const { system, task: t } of rendered) {
      expect(system).not.toMatch(/\{\{/);
      expect(t).not.toMatch(/\{\{/);
    }
  });
});

describe("buildBuilderPrompts", () => {
  it("names the docs, the pin, the workspace and the gaps section", () => {
    const { system, task: t } = buildBuilderPrompts(task, {
      docsDir: "/run/docs",
      pin: "6.2.2-dev.62",
      workspaceDir: "/run/w",
      arm: "A",
    });
    expect(system).toContain("`/run/docs/INDEX.md`");
    expect(system).toContain("version `6.2.2-dev.62`");
    expect(system).toContain("`/run/w`");
    expect(system).toContain("## Documentation gaps");
    expect(system).not.toContain("Reference implementation");
    expect(t).toContain("# Task: Custom read model");
    expect(t).toContain(
      "- `src/document-count-read-model.ts` exports `DocumentCountReadModel`",
    );
    expect(t).toContain("- `src/index.ts`");
  });

  it("appends the reference section for arm B and requires referenceDir", () => {
    const { system } = buildBuilderPrompts(task, {
      docsDir: "/d",
      pin: "p",
      workspaceDir: "/w",
      arm: "B",
      referenceDir: "/w/reference",
    });
    expect(system).toContain("## Reference implementation");
    expect(system).toContain("`/w/reference`");
    expect(() =>
      buildBuilderPrompts(task, {
        docsDir: "/d",
        pin: "p",
        workspaceDir: "/w",
        arm: "B",
      }),
    ).toThrow(/referenceDir/);
  });

  it("renders an empty contract as a note", () => {
    expect(renderContract([])).toMatch(/no files/);
  });

  it("puts a pinned declaration under the export it belongs to", () => {
    const rendered = renderContract([
      {
        file: "src/upgrade.ts",
        exports: ["computeUpgradePath", "upgradeDocument"],
        signatures: {
          upgradeDocument: "upgradeDocument<TTo extends PHBaseState>(d, m)",
        },
      },
      { file: "src/demo.ts", exports: [] },
    ]);
    expect(rendered).toBe(
      [
        "- `src/upgrade.ts` exports `computeUpgradePath`, `upgradeDocument`",
        "  - `upgradeDocument` must be declared `upgradeDocument<TTo extends PHBaseState>(d, m)`",
        "- `src/demo.ts`",
      ].join("\n"),
    );
  });

  it("carries the declaration into the builder task prompt", () => {
    const { task: rendered } = buildBuilderPrompts(
      {
        ...task,
        contract: [
          {
            file: "src/upgrade.ts",
            exports: ["upgradeDocument"],
            signatures: { upgradeDocument: "upgradeDocument<TTo>(d, m)" },
          },
        ],
      },
      { docsDir: "/d", pin: "p", workspaceDir: "/w", arm: "A" },
    );
    expect(rendered).toContain("typechecked");
    expect(rendered).toContain("must be declared `upgradeDocument<TTo>(d, m)`");
  });
});

describe("buildJudgePrompt", () => {
  it("lists every input path and the four kinds", () => {
    const { system, task: t } = buildJudgePrompt(task, judgeVars);
    for (const p of [
      judgeVars.metricsPath,
      judgeVars.compactPath,
      judgeVars.testsPath,
      judgeVars.docsDir,
      judgeVars.docsIndex,
      judgeVars.dtsDir,
    ]) {
      expect(system).toContain(`\`${p}\``);
    }
    for (const kind of ["WRONG", "STALE", "MISSING", "UNCLEAR"]) {
      expect(system).toContain(`- ${kind}:`);
    }
    expect(system).not.toContain("reference implementation");
    expect(t).toContain("custom-read-model");
    expect(t).toContain(task.taskPrompt);
  });

  it("adds the reference input for arm B", () => {
    const { system } = buildJudgePrompt(task, {
      ...judgeVars,
      arm: "B",
      referenceDir: "/w/reference",
    });
    expect(system).toContain("`/w/reference`");
  });
});

describe("buildVerifierPrompt", () => {
  it("renders findings by index with quote and claim", () => {
    const { system, task: t } = buildVerifierPrompt({
      taskId: "custom-read-model",
      arm: "A",
      pin: "6.2.2-dev.62",
      workspaceDir: "/w",
      docsDir: "/d",
      compactPath: "/c.md",
      findings: [
        { index: 2, finding },
        {
          index: 5,
          finding: { ...finding, kind: "MISSING", docPath: null, quote: null },
        },
      ],
    });
    expect(system).toContain("`/w/__verify__/`");
    expect(system).toContain("npx tsc --noEmit -p /w/__verify__");
    expect(t).toContain("### 2: WRONG `ReactorBuilder.withReadModel`");
    expect(t).toContain("line 12");
    expect(t).toContain(
      'quote: ".withReadModel(new DocumentCountReadModel())"',
    );
    expect(t).toContain("### 5: MISSING");
    expect(t).toContain("docPath: (none)");
  });
});

describe("prompts/schemas", () => {
  it("match a fresh generation (run pnpm exec tsx scripts/gen-schemas.ts)", () => {
    const fresh = renderSchemaFiles();
    expect(Object.keys(fresh).sort()).toEqual([
      "judge.schema.json",
      "verifier.schema.json",
    ]);
    for (const [file, contents] of Object.entries(fresh)) {
      expect(readFileSync(schemaFilePath(file), "utf8")).toBe(contents);
    }
  });

  it("are plain strict object schemas", () => {
    for (const contents of Object.values(renderSchemaFiles())) {
      const schema = JSON.parse(contents) as Record<string, unknown>;
      expect(schema.$schema).toBeUndefined();
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
    }
    const verifier = JSON.parse(
      renderSchemaFiles()["verifier.schema.json"],
    ) as {
      properties: { results: { items: { required: string[] } } };
    };
    expect(verifier.properties.results.items.required).not.toContain(
      "byPrecheck",
    );
  });

  it("live under prompts/schemas", () => {
    expect(path.dirname(schemaFilePath("judge.schema.json"))).toBe(
      path.join(PROMPTS_ROOT, "schemas"),
    );
  });
});
