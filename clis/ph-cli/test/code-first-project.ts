import {
  documentModelsIndexTemplate,
  documentModelsTemplate,
  editorsIndexTemplate,
  editorsTemplate,
  upgradeManifestsTemplate,
} from "@powerhousedao/codegen/templates";
import { formatSafe } from "@powerhousedao/codegen/utils";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";

const packages = join(import.meta.dirname, "..", "..", "..", "packages");

export async function createProject(config: object = {}): Promise<string> {
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), "ph-cli-cf-")));
  mkdirSync(join(dir, "node_modules", "@powerhousedao"), { recursive: true });
  symlinkSync(
    join(packages, "document-model"),
    join(dir, "node_modules", "document-model"),
  );
  symlinkSync(
    join(packages, "shared"),
    join(dir, "node_modules", "@powerhousedao", "shared"),
  );
  writeJson(dir, "package.json", { name: "@acme/things", type: "module" });
  writeJson(dir, "powerhouse.config.json", config);
  writeJson(dir, "tsconfig.json", {
    compilerOptions: {
      module: "nodenext",
      target: "esnext",
      strict: true,
      skipLibCheck: true,
      noEmit: true,
    },
  });
  for (const [path, template] of [
    ["document-models/index.ts", documentModelsIndexTemplate],
    ["document-models/document-models.ts", documentModelsTemplate],
    ["document-models/upgrade-manifests.ts", upgradeManifestsTemplate],
    ["editors/index.ts", editorsIndexTemplate],
    ["editors/editors.ts", editorsTemplate],
  ] as const) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), await formatSafe(template));
  }
  return dir;
}

export function writeJson(dir: string, path: string, value: unknown) {
  writeFileSync(join(dir, path), `${JSON.stringify(value, null, 2)}\n`);
}

export const read = (dir: string, path: string) =>
  readFileSync(join(dir, path), "utf8");

export const readJson = (dir: string, path: string): unknown =>
  JSON.parse(read(dir, path));

export async function printed(run: () => Promise<unknown>) {
  const lines: string[] = [];
  const log = vi
    .spyOn(console, "log")
    .mockImplementation((line: unknown) => void lines.push(String(line)));
  try {
    await run();
  } finally {
    log.mockRestore();
  }
  return lines;
}
