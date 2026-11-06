import type { DefinitionCheckReport } from "@powerhousedao/shared/document-model";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runModelCheck } from "../src/services/model/check.js";
import {
  createModelProject,
  LEDGER_SOURCE,
  type Project,
  type Shape,
} from "./model-project.js";
import { treeDigest } from "./staged-build-project.js";

const made: Project[] = [];
afterEach(() => {
  made.splice(0).forEach((project) => project.dispose());
});

function project(
  shape: Shape,
  files: Readonly<Record<string, string>> = {},
): string {
  const created = createModelProject(shape, files);
  made.push(created);
  return created.root;
}

async function check(
  root: string,
  args: { json: boolean; release?: boolean; prepack?: boolean },
) {
  let stdout = "";
  let stderr = "";
  const code = await runModelCheck(args, {
    projectRoot: root,
    streams: {
      out: (text) => void (stdout += text),
      err: (text) => void (stderr += text),
    },
  });
  return { code, stdout, stderr };
}

const IBAN = `import { defineScalar } from "document-model/scalars";
import { z } from "zod";

export const Iban = defineScalar({
  name: "Iban",
  description: "International bank account number",
  schema: z.string().regex(/^[A-Z]{2}\\d{2}[A-Z0-9]{11,30}$/),
  example: "DE89370400440532013000",
});
`;

/** The ledger takes Iban from scalars/iban.ts, so the scalars entry can differ from it. */
const scalarsEntry = (entry: string) => ({
  "scalars/iban.ts": IBAN,
  "scalars/index.ts": entry,
  "document-models/ledger/index.ts": LEDGER_SOURCE.replace(
    "../../scalars/index.js",
    "../../scalars/iban.js",
  ),
});

const where = ({
  code,
  phase,
  path,
  received,
}: DefinitionCheckReport["diagnostics"][number]) => ({
  code,
  phase,
  path,
  ...(received !== undefined && { received }),
});

describe("ph model check --release", () => {
  it.each(["code-first", "mixed"] as const)(
    "exits 0 for a healthy %s project and writes nothing",
    async (shape) => {
      const root = project(shape);
      const before = treeDigest(root, ["."]);

      const result = await check(root, { json: true, release: true });

      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
      const report = JSON.parse(result.stdout) as DefinitionCheckReport;
      expect({
        profile: report.profile,
        status: report.status,
        diagnostics: report.diagnostics,
      }).toEqual({ profile: "release", status: "ok", diagnostics: [] });
      expect(treeDigest(root, ["."])).toEqual(before);
    },
    60_000,
  );

  it("exits 1 when the scalars entry does not export a scalar a model declares", async () => {
    const root = project("code-first", scalarsEntry("export {};\n"));

    const result = await check(root, { json: false, release: true });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe(
      [
        "invalid: 1 definition (code-first, 1 selected source)",
        "  document-model example/ledger v1 ./document-models/ledger/index.ts#/Ledger",
        "PH-REL-HOST-SCALAR-UNBOUND [error/package] ./document-models/ledger/index.ts#/Ledger scalar Iban /specifications/0/scalars/1: example/ledger declares package scalar Iban, but the package registers no binding for it, so a host serves Iban values without validating them. Expected: an export named Iban in the package's scalars entry Received: no binding Repair: Export the defineScalar binding the model uses from scalars/index.ts under the name Iban.",
        "1 error, 0 warnings",
        "",
      ].join("\n"),
    );
  }, 60_000);

  it("exits 1 when the scalars entry exports another Iban than the model declares", async () => {
    const root = project(
      "code-first",
      scalarsEntry(
        IBAN.replace(
          "International bank account number",
          "Some other account number",
        ),
      ),
    );

    const result = await check(root, { json: true, release: true });

    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout) as DefinitionCheckReport;
    expect(report.diagnostics.map(where)).toEqual([
      {
        code: "PH-REL-HOST-SCALAR-MISMATCH",
        phase: "package",
        path: ["specifications", 0, "scalars", 1],
        received: JSON.stringify({
          coercion: { source: "derived" },
          coercionProfile: "catalog-v1",
          description: "Some other account number",
          formatVersion: 1,
          kind: "powerhouse.scalar",
          name: "Iban",
          representation: "string",
        }),
      },
    ]);
  }, 60_000);

  it("exits 1 when the scalars entry exports an Iban with the model's metadata and another validator", async () => {
    const root = project(
      "code-first",
      scalarsEntry(IBAN.replace("/^[A-Z]{2}\\d{2}[A-Z0-9]{11,30}$/", "/^DE/")),
    );

    const result = await check(root, { json: true, release: true });

    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout) as DefinitionCheckReport;
    const metadata = {
      coercion: { source: "derived" },
      coercionProfile: "catalog-v1",
      description: "International bank account number",
      formatVersion: 1,
      kind: "powerhouse.scalar",
      name: "Iban",
      representation: "string",
    };
    expect(report.diagnostics.map(where)).toEqual([
      {
        code: "PH-REL-HOST-SCALAR-MISMATCH",
        phase: "package",
        path: ["specifications", 0, "scalars", 1],
        received: JSON.stringify({
          ...metadata,
          validator: {
            jsonSchema: {
              $schema: "https://json-schema.org/draft/2020-12/schema",
              pattern: "^DE",
              type: "string",
            },
          },
        }),
      },
    ]);
  }, 60_000);

  describe("an Iban refined in a way JSON Schema cannot express", () => {
    const refined = (prefix: string) =>
      IBAN.replace(
        "z.string().regex(/^[A-Z]{2}\\d{2}[A-Z0-9]{11,30}$/)",
        `z.string().refine((value) => value.startsWith("${prefix}"))`,
      ).replace('  example: "DE89370400440532013000",\n', "");

    it("exits 0 when the scalars entry exports the Iban the model uses", async () => {
      const root = project("code-first", {
        ...scalarsEntry('export { Iban } from "./iban.js";\n'),
        "scalars/iban.ts": refined("DE"),
      });

      const result = await check(root, { json: true, release: true });

      expect(result.code).toBe(0);
      const report = JSON.parse(result.stdout) as DefinitionCheckReport;
      expect(report.diagnostics).toEqual([]);
    }, 60_000);

    it("exits 1 when the scalars entry exports one refined the other way", async () => {
      const root = project("code-first", {
        ...scalarsEntry(refined("NL")),
        "scalars/iban.ts": refined("DE"),
      });

      const result = await check(root, { json: true, release: true });

      expect(result.code).toBe(1);
      const report = JSON.parse(result.stdout) as DefinitionCheckReport;
      const validator = (prefix: string) =>
        JSON.stringify({
          coercion: { source: "derived" },
          coercionProfile: "catalog-v1",
          description: "International bank account number",
          formatVersion: 1,
          kind: "powerhouse.scalar",
          name: "Iban",
          representation: "string",
          validator: {
            zod: {
              checks: [
                {
                  check: "custom",
                  fn: { function: `(value) => value.startsWith("${prefix}")` },
                  type: "custom",
                },
              ],
              type: "string",
            },
          },
        });
      expect(
        report.diagnostics.map((diagnostic) => ({
          ...where(diagnostic),
          expected: diagnostic.expected,
        })),
      ).toEqual([
        {
          code: "PH-REL-HOST-SCALAR-UNCOMPARABLE",
          phase: "package",
          path: ["specifications", 0, "scalars", 1],
          expected: validator("DE"),
          received: validator("NL"),
        },
      ]);
    }, 60_000);
  });

  it("fails with the reason when the scalars entry throws", async () => {
    const root = project(
      "code-first",
      scalarsEntry('throw new Error("scalars exploded");\n'),
    );

    const result = await check(root, { json: true, release: true });

    expect(result.code).toBe(2);
    const report = JSON.parse(result.stdout) as DefinitionCheckReport;
    expect(report.status).toBe("failed");
    expect(report.diagnostics.map(where)).toEqual([
      {
        code: "PH-REL-HOST-VALIDATION-INCOMPLETE",
        phase: "import",
        path: [],
        received: "./scalars/index.ts could not be loaded: scalars exploded",
      },
    ]);
  }, 60_000);

  it("fails when package.json has no name", async () => {
    const root = project("code-first", {
      "package.json": JSON.stringify({ version: "0.0.0", type: "module" }),
    });

    const result = await check(root, { json: true, release: true });

    expect(result.code).toBe(2);
    const report = JSON.parse(result.stdout) as DefinitionCheckReport;
    expect(report.status).toBe("failed");
    expect(report.diagnostics.map(where)).toEqual([
      {
        code: "PH-REL-HOST-VALIDATION-INCOMPLETE",
        phase: "import",
        path: [],
        received:
          "package.json has no name, and a host registers package scalars by package name",
      },
    ]);
  }, 60_000);

  it("exits 0 for a package without a scalars entry whose models use only catalog scalars", async () => {
    const root = project("code-first", {
      "document-models/ledger/index.ts": LEDGER_SOURCE.replace(
        'import { Iban } from "../../scalars/index.js";\n',
        "",
      )
        .replace("          iban: ph.scalar(Iban),\n", "")
        .replace(", iban: null", ""),
    });
    rmSync(join(root, "scalars"), { recursive: true });

    const result = await check(root, { json: true, release: true });

    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as DefinitionCheckReport;
    expect({ status: report.status, diagnostics: report.diagnostics }).toEqual({
      status: "ok",
      diagnostics: [],
    });
  }, 60_000);

  it("leaves the edit profile as it was", async () => {
    const root = project("code-first", scalarsEntry("export {};\n"));

    const result = await check(root, { json: true });

    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as DefinitionCheckReport;
    expect({ profile: report.profile, status: report.status }).toEqual({
      profile: "edit",
      status: "ok",
    });
  }, 60_000);
});

describe("ph model check --prepack", () => {
  // A module that leaves a file next to the package when it is loaded.
  const marking = {
    "document-models/ledger/index.ts": `process.getBuiltinModule("node:fs").appendFileSync(new URL("../../imported", import.meta.url), "x");\n${LEDGER_SOURCE}`,
  };

  it("exits 1 and names the reason when there is no approval, and loads no module", async () => {
    const root = project("code-first", marking);

    expect(await check(root, { json: true, prepack: true })).toEqual({
      code: 1,
      stdout: `${JSON.stringify({
        decision: "missing",
        reasons: [
          "there is no release approval (.ph/build/release-approval.json); ph build --release writes one",
        ],
      })}\n`,
      stderr: "",
    });
    expect(await check(root, { json: false, prepack: true })).toEqual({
      code: 1,
      stdout: [
        "missing: this package has no release approval",
        "  - there is no release approval (.ph/build/release-approval.json); ph build --release writes one",
        "",
      ].join("\n"),
      stderr: "",
    });
    expect(existsSync(join(root, "imported"))).toBe(false);
    await check(root, { json: true });
    expect(existsSync(join(root, "imported"))).toBe(true);
  });

  it.each([
    ["not JSON", "{", "it is not JSON"],
    [
      "another format",
      JSON.stringify({
        kind: "powerhouse.release-approval",
        formatVersion: 1,
        phCliVersion: "6.0.0",
        outDir: "dist",
        packageRevision: { digest: "sha256:0", excluded: [] },
        publishedFiles: [{ path: "dist/index.js", sha256: 7 }],
      }),
      "it is not an approval this ph-cli reads (Invalid input: expected string, received number at publishedFiles.0.sha256)",
    ],
  ])("exits 1 for an approval that is %s", async (_, text, reason) => {
    const root = project("code-first", {
      ".ph/build/release-approval.json": text,
    });

    expect(await check(root, { json: true, prepack: true })).toEqual({
      code: 1,
      stdout: `${JSON.stringify({
        decision: "unreadable",
        reasons: [
          `the release approval (.ph/build/release-approval.json) cannot be read: ${reason}`,
        ],
      })}\n`,
      stderr: "",
    });
  });

  it("cannot be combined with --release", async () => {
    const root = project("code-first");

    expect(
      await check(root, { json: true, prepack: true, release: true }),
    ).toEqual({
      code: 2,
      stdout: "",
      stderr:
        "ph model check could not run: --prepack and --release cannot be combined.\n",
    });
  });
});
