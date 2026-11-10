import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { importDirectionViolations } from "./import-direction.js";

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));

const withLine = (file: string, line: string) =>
  new Map([
    [join(ROOT, file), `${line}\n${readFileSync(join(ROOT, file), "utf8")}`],
  ]);

describe("code-first import direction", () => {
  it("holds across document-model, codegen, ph-cli and the hosts", () => {
    expect(importDirectionViolations(ROOT)).toStrictEqual([]);
  }, 60_000);

  it.each([
    [
      "packages/document-model/src/definition/kernel/primitives.ts",
      'import { compileDocumentModel } from "../compiler/compile.js";',
      "packages/document-model/src/definition/kernel/primitives.ts -> ../compiler/compile.js: kernel cannot import compiler",
    ],
    [
      "packages/codegen/src/codegen/document-model-generation.ts",
      'import { buildCommand } from "@powerhousedao/ph-cli/commands";',
      "packages/codegen/src/codegen/document-model-generation.ts -> @powerhousedao/ph-cli/commands: codegen cannot import CLI",
    ],
  ])(
    "reports an injected wrong-direction import in %s",
    (file, line, error) => {
      expect(importDirectionViolations(ROOT, withLine(file, line))).toContain(
        error,
      );
    },
    60_000,
  );
});
