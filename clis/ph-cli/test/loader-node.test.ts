import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { BuildGraphTypeScriptSourceImportAdapter } from "../src/services/definitions/import-adapters.js";
import { cleanUp, packageWith } from "./helpers/declarations.js";

afterEach(cleanUp);

it("enforces Node's ESM named-export linking for definition modules", async () => {
  const root = packageWith("code-first");
  const directory = join(root, ".ph", "build", "probe");
  mkdirSync(directory, { recursive: true });
  const emitted = join(directory, "definition.js");
  writeFileSync(join(directory, "empty.js"), "export {};\n");
  writeFileSync(emitted, 'export { Missing } from "./empty.js";\n');
  const adapter = new BuildGraphTypeScriptSourceImportAdapter({
    packageRoot: root,
    emittedModules: new Map([[join(root, "index.ts"), emitted]]),
  });
  await expect(
    adapter.importModule({ specifier: "./index.ts" }),
  ).rejects.toThrow("does not provide an export named 'Missing'");
});
