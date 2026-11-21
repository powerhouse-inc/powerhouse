import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf-8"),
) as {
  exports: Record<string, Record<string, string> | string>;
};

const SURFACES: Record<string, { source: string; names: string[] }> = {
  ".": {
    source: "./src/index.ts",
    names: [
      "defineCli",
      "buildDefaultReactor",
      "attachDefaultReactor",
      "SignerNotReadyError",
      "signerReady",
      "policyOfHeader",
    ],
  },
  "./mastra": {
    source: "./src/integrations/mastra/index.ts",
    names: [
      "createMastraHelpers",
      "getMastraPaths",
      "commandsToMastraTools",
      "mapMastraStream",
      "CLINT_THREAD_ID_KEY",
    ],
  },
  "./powerhouse": {
    source: "./src/integrations/powerhouse/index.ts",
    names: [
      "ensureDrive",
      "createAttachmentCommands",
      "attachRemoteReactor",
      "attachDefaultReactor",
      "SignerNotReadyError",
      "createGatedSigner",
      "signerReady",
      "policyOfHeader",
      "createReactorWrites",
    ],
  },
  "./testing": {
    source: "./src/testing/index.ts",
    names: ["createStreamingClient", "createTerminalClient"],
  },
  "./cli-runner": {
    source: "./src/runners/cli-runner.ts",
    names: ["run", "runCli", "loadCli", "hostSchema", "argsSchema"],
  },
  "./proxy-runner": {
    source: "./src/runners/proxy-runner.ts",
    names: ["run", "hostSchema", "outputsSchema"],
  },
};

describe("package export surfaces", () => {
  for (const [subpath, { source, names }] of Object.entries(SURFACES)) {
    describe(subpath, () => {
      it("is in the export map with source/types/import/default", () => {
        const entry = pkg.exports[subpath] as Record<string, string>;
        expect(entry).toBeDefined();
        expect(entry.source).toBe(source);
        const out = source.replace("./src/", "./dist/").replace(/\.ts$/, "");
        expect(entry.types).toBe(`${out}.d.mts`);
        expect(entry.import).toBe(`${out}.mjs`);
        expect(entry.default).toBe(`${out}.mjs`);
      });

      it("has an existing source file", () => {
        const entry = pkg.exports[subpath] as Record<string, string>;
        expect(existsSync(path.join(root, entry.source))).toBe(true);
      });

      it("exports the expected names", async () => {
        const mod = (await import(
          /* @vite-ignore */ path.join(root, source)
        )) as Record<string, unknown>;
        for (const name of names) {
          expect(mod[name], name).toBeDefined();
        }
      });
    });
  }
});
