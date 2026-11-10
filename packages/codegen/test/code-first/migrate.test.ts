import {
  existsSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateDocumentModel } from "../../src/codegen/index.js";
import { migrate } from "../../src/codegen/migrate.js";
import { loadDocumentModel } from "../../src/codegen/utils.js";
import {
  copySchemaFirstSpec,
  createPackage,
  inProject,
  read,
  removePackage,
  tree,
} from "./package.js";

let dir: string;
beforeEach(async () => {
  dir = await createPackage();
});
afterEach(() => removePackage(dir));

describe("ph migrate", () => {
  beforeEach(() => {
    Object.assign(globalThis, { WORKSPACE_PACKAGES: [] });
  });

  it.each([
    'export { SubgraphModule } from "./subgraph-module/module.js";\n',
    'export { module as SubgraphModule } from "./subgraph-module/index.js";\n',
    'export {};\nexport { module as SubgraphModule } from "./subgraph-module/index.js";\n',
  ])(
    "upgrades an unversioned schema-first layout with barrel %s",
    async (barrel) => {
      const state = await loadDocumentModel(copySchemaFirstSpec(dir));
      await inProject(dir, (project) => generateDocumentModel(state, project));
      const model = join(dir, "document-models/subgraph-module");
      for (const name of readdirSync(join(model, "v1"))) {
        renameSync(join(model, "v1", name), join(model, name));
      }
      rmSync(join(model, "v1"), { recursive: true });
      writeFileSync(join(dir, "document-models/index.ts"), barrel);
      await migrate("6.2.3-dev.90", dir, { skipInstall: true });
      expect(read(dir, "document-models/index.ts")).toContain(
        "SubgraphModule as SubgraphModuleV1",
      );
      expect(existsSync(join(model, "v1/module.ts"))).toBe(true);
      expect(existsSync(join(model, "module.ts"))).toBe(false);
    },
  );

  it("rebuilds the barrels ph init wrote from 6.0.0-dev.106 to dev.111", async () => {
    const sharedTypes = "@powerhousedao/shared/document-model";
    writeFileSync(
      join(dir, "document-models/document-models.ts"),
      `import type { DocumentModelModule } from "${sharedTypes}";\n\nexport const documentModels: DocumentModelModule[] = [];\n`,
    );
    writeFileSync(
      join(dir, "document-models/upgrade-manifests.ts"),
      `import type { UpgradeManifest } from "${sharedTypes}";\n\nexport const upgradeManifests: UpgradeManifest<readonly number[]>[] = [];\n`,
    );
    await migrate("6.2.3-dev.90", dir, { skipInstall: true });
    expect(read(dir, "document-models/document-models.ts")).not.toContain(
      sharedTypes,
    );
    expect(read(dir, "document-models/upgrade-manifests.ts")).toContain(
      'import type { UpgradeManifest } from "document-model";',
    );
  });

  it("refuses an authored barrel before any migrate writes", async () => {
    const state = await loadDocumentModel(copySchemaFirstSpec(dir));
    await inProject(dir, (project) => generateDocumentModel(state, project));
    writeFileSync(
      join(dir, "document-models/index.ts"),
      `${read(dir, "document-models/index.ts")}export const authored = 1;\n`,
    );
    const authoredImport =
      'import { DocumentModelGlobalStateSchema } from "@powerhousedao/shared/document-model";';
    writeFileSync(
      join(dir, "document-models/document-models.ts"),
      `${authoredImport}\n${read(dir, "document-models/document-models.ts")}`,
    );
    const before = tree(dir);
    const refused = migrate("6.2.3-dev.90", dir, { skipInstall: true });
    await expect(refused).rejects.toThrow("export const authored = 1");
    await expect(refused).rejects.toThrow(authoredImport);
    expect(tree(dir)).toStrictEqual(before);
  });
});
