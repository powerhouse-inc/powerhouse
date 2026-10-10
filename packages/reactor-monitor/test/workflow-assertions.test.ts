import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baseDocumentModels } from "@powerhousedao/reactor-browser/base-document-models";
// The `./document-models/workflow` subpath, not the package's top-level
// `./document-models` barrel: that barrel's `upgrade-manifests.ts` re-exports
// through a bare `"document-models/..."` specifier that only resolves inside
// the workflow package's own tsconfig path-alias/vite setup, not from an
// external consumer like this one.
import { Workflow as WorkflowV1 } from "@powerhousedao/workflow/document-models/workflow";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  linkLocalSync,
  provisionInProcess,
  type ManagedInProcessReactor,
  type ReactorDescriptor,
} from "../src/index.js";
import { descriptor, nodeChannel } from "./helpers.js";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";

// Each generated document model module is typed over its own state shape;
// `baseDocumentModelsMap` (reactor-browser/src/document-model.ts) widens the
// same way when it builds `baseDocumentModels`.
const workflowDocumentModelModule =
  WorkflowV1 as unknown as DocumentModelModule;

/**
 * W1.5 (docs/plans/2026-10-03-multi-reactor.md, Stage 1 decision 3): workflow
 * EXECUTION is a singleton pinned to one designated Node reactor, and a
 * browser/in-process reactor must never register the workflow trigger read
 * model. Two assertions:
 *
 * 1. A `powerhouse/workflow` DOCUMENT still syncs like any other document --
 *    the monitor's in-process provisioning can register the real
 *    `@powerhousedao/workflow/document-models` module via
 *    `documentModelModules`, and the drive-local-sync path carries it intact.
 * 2. No trigger execution: reactor-monitor registers no workflow-trigger
 *    read model. There is no clean runtime introspection for "a read model
 *    that was never wired" (the inspector's processor list is simply empty,
 *    whether or not workflow support is even linked in), so this is checked
 *    at the build level instead -- `@powerhousedao/reactor-workflow` (the
 *    engine package `WorkflowTriggersReadModel` lives in) is absent from
 *    every dependency field, and no `src/` file's import/require statements
 *    name the engine's composition entry points. A reactor cannot register a
 *    read model from a class it never imports, so the absence of the import
 *    is itself the proof of the absence of the registration. The runtime
 *    half of this test (provisioning a drive and reading the actually-
 *    provisioned reactor's processor list) adds a second, independent line
 *    of evidence on top of the static one.
 */
function workflowDescriptor(name: string): ReactorDescriptor {
  return descriptor(name, {
    sync: { local: true },
    // documentModelModules REPLACES the default set (build-reactor.ts falls
    // back to baseDocumentModels only when this is omitted entirely), so the
    // base models are spread back in alongside the workflow one.
    documentModelModules: [...baseDocumentModels, workflowDocumentModelModule],
  });
}

describe("workflow documents sync as documents; no trigger execution (W1.5)", () => {
  const provisioned: ManagedInProcessReactor[] = [];

  async function host(name: string): Promise<ManagedInProcessReactor> {
    const reactor = await provisionInProcess(workflowDescriptor(name));
    provisioned.push(reactor);
    return reactor;
  }

  afterEach(async () => {
    for (const reactor of provisioned.splice(0)) {
      await reactor.kill();
    }
  });

  it("syncs a powerhouse/workflow document from A to B intact", async () => {
    const a = await host("wf-a");
    const b = await host("wf-b");

    const drive = await a.client.drives.create({
      global: { name: "Workflows" },
    });
    const driveId = drive.header.id;
    await linkLocalSync(a, b, { driveId, createChannel: nodeChannel });

    // An unpersisted draft (header + default state), not yet known to any
    // reactor -- `drives.addFile` is what actually creates it (CREATE_DOCUMENT
    // + UPGRADE_DOCUMENT + ADD_RELATIONSHIP in one batch), which is also what
    // gives it drive-collection membership so the local-sync link carries it.
    const draft = WorkflowV1.utils.createDocument();
    draft.header.name = "stage1-w1.5-workflow";
    const created = await a.client.drives.addFile(driveId, draft);
    const workflowId = created.header.id;

    await vi.waitFor(
      async () => {
        const onB = await b.client.get(workflowId).catch(() => undefined);
        expect(onB).toBeDefined();
      },
      { timeout: 15_000 },
    );

    const onA = await a.client.get(workflowId);
    const onB = await b.client.get(workflowId);
    expect(onB.header.documentType).toBe("powerhouse/workflow");
    expect(onB.header.name).toBe(onA.header.name);
    // The whole document arrives as a document: state included, not just
    // the header a drive node summarizes.
    expect(onB.state).toEqual(onA.state);
  }, 30_000);

  it("never imports or registers the workflow-trigger read model", async () => {
    const packageRoot = fileURLToPath(new URL("..", import.meta.url));

    const pkg = JSON.parse(
      readFileSync(path.join(packageRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const everyDependency = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ]);
    // The engine package (WorkflowTriggersReadModel, composeWorkflowRuntime,
    // the Activepieces-backed runner) is absent from every dependency field.
    // @powerhousedao/workflow (the DOCUMENT MODEL, used above) stays --
    // only the engine is forbidden.
    expect(everyDependency.has("@powerhousedao/reactor-workflow")).toBe(false);

    const srcRoot = path.join(packageRoot, "src");
    const forbidden = [
      "composeWorkflowRuntime",
      "WorkflowTriggersReadModel",
      "reactor-workflow",
    ];
    for (const file of listTsFiles(srcRoot)) {
      const content = readFileSync(file, "utf8");
      const importStatements = listImportStatements(content).join("\n");
      for (const needle of forbidden) {
        expect(
          importStatements.includes(needle),
          `${file} imports forbidden "${needle}"`,
        ).toBe(false);
      }
    }

    // Second, independent line of evidence: a drive-provisioned reactor
    // registers no processor at all -- not merely none whose factory names
    // "workflow" -- the live confirmation to pair with the static import
    // check above. Provisioning a drive first (rather than asserting on a
    // bare reactor) means a future drive-scoped workflow factory
    // registration would actually fail this assertion.
    const reactor = await host("wf-no-trigger-check");
    await reactor.client.drives.create({ global: { name: "Trigger-check" } });
    const processors = await reactor.inspector.getProcessors();
    expect(processors).toEqual([]);
  });
});

function listTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

/** Every `import`/`require(...)` statement in `content`, so a scan over them never trips on a comment or string that merely mentions a forbidden name. */
const IMPORT_STATEMENT_PATTERN =
  /\bimport\s[\s\S]*?;|\brequire\(\s*["'][^"']*["']\s*\)/g;

function listImportStatements(content: string): string[] {
  return content.match(IMPORT_STATEMENT_PATTERN) ?? [];
}
