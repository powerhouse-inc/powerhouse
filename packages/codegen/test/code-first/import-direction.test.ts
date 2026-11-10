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
    [
      "packages/document-model/src/definition/tooling/subgraph/inspection.ts",
      'import { schemaFirstSdlConflicts } from "./schema-first/sdl-conflicts.js";',
      "packages/document-model/src/definition/tooling/subgraph/inspection.ts -> ./schema-first/sdl-conflicts.js: only tooling/subgraph/checks.ts and input.ts reach the schema-first SDL reader",
    ],
    // definition/subgraph sits at model's rank, below runtime.
    [
      "packages/document-model/src/definition/subgraph/projection.ts",
      'import { materialize } from "../runtime/materialize.js";',
      "packages/document-model/src/definition/subgraph/projection.ts -> ../runtime/materialize.js: subgraph cannot import runtime",
    ],
    [
      "packages/document-model/src/definition/model/normalize.ts",
      'import { readSubgraphProtocol } from "../subgraph/protocol.js";',
      "packages/document-model/src/definition/model/normalize.ts -> ../subgraph/protocol.js: model and subgraph are siblings; neither imports the other",
    ],
    [
      "packages/document-model/src/definition/subgraph/projection.ts",
      'import { z } from "zod";',
      "packages/document-model/src/definition/subgraph/projection.ts -> zod: subgraph imports zod types only; validators come from dsl/zod",
    ],
    [
      "packages/document-model/src/definition/subgraph/projection.ts",
      'import { print } from "graphql";',
      "packages/document-model/src/definition/subgraph/projection.ts -> graphql: external import not allowed by layer",
    ],
    // tooling/subgraph ranks above check and inspect, below project, and
    // apart from release.
    [
      "packages/document-model/src/definition/tooling/subgraph/input.ts",
      'import { loadProjectDefinitions } from "../project/project-definitions.js";',
      "packages/document-model/src/definition/tooling/subgraph/input.ts -> ../project/project-definitions.js: tooling/subgraph cannot import tooling/project",
    ],
    [
      "packages/document-model/src/definition/tooling/release/release-checks.ts",
      'import { subgraphChecks } from "../subgraph/checks.js";',
      "packages/document-model/src/definition/tooling/release/release-checks.ts -> ../subgraph/checks.js: tooling/release cannot import tooling/subgraph",
    ],
    // Only tooling/subgraph reads definition/subgraph: the protocol reader
    // in read.ts, and the projection.
    [
      "packages/document-model/src/definition/tooling/release/release-checks.ts",
      'import { projectSubgraphGraphQL } from "../../subgraph/projection.js";',
      "packages/document-model/src/definition/tooling/release/release-checks.ts -> ../../subgraph/projection.js: only tooling/subgraph reads definition/subgraph",
    ],
    [
      "packages/document-model/src/definition/tooling/subgraph/checks.ts",
      'import { compileSubgraph } from "../../subgraph/compile.js";',
      "packages/document-model/src/definition/tooling/subgraph/checks.ts -> ../../subgraph/compile.js: tooling/subgraph reads classes through read.ts's protocol reader and projects with subgraph/projection.ts; it never builds or compiles a subgraph",
    ],
    [
      "packages/document-model/src/definition/tooling/subgraph/input.ts",
      'import { readSubgraphProtocol } from "../../subgraph/protocol.js";',
      "packages/document-model/src/definition/tooling/subgraph/input.ts -> ../../subgraph/protocol.js: tooling/subgraph reads classes through read.ts's protocol reader and projects with subgraph/projection.ts; it never builds or compiles a subgraph",
    ],
    // subgraphs.ts reaches schema first only through the schema-first SDL read.
    [
      "clis/ph-cli/src/services/model/check.ts",
      'import { schemaFirstSource } from "./schema-first/sdl-sources.js";',
      "clis/ph-cli/src/services/model/check.ts -> ./schema-first/sdl-sources.js: model commands read normalized artifacts only",
    ],
    [
      "clis/ph-cli/src/services/model/subgraphs.ts",
      'import { adaptSchemaFirstDocumentModel } from "document-model/tooling";',
      "clis/ph-cli/src/services/model/subgraphs.ts -> document-model/tooling: model commands read normalized artifacts only",
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
