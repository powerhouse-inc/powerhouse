import { generateAll } from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { describe, expect, it } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TEST_OUTPUT, WITH_EDITORS } from "../constants.js";
import { cpForce, mkdirRecursive, rmForce } from "../utils.js";

const parentOutDir = join(TEST_OUTPUT, "project-ai-tools-export");
await rmForce(parentOutDir);
await mkdirRecursive(parentOutDir);

const EXPORT_LINE = 'export { aiTools } from "./ai/tools.js";';

async function runGenerateAll(outDir: string) {
  const project = buildTsMorphProject(outDir);
  await generateAll(project);
  await project.save();
}

describe("aiTools export sync in the project index.ts", () => {
  it("adds the export when ai/tools.ts exists and removes it when it does not", async () => {
    const outDir = join(parentOutDir, "sync");
    await cpForce(WITH_EDITORS, outDir);

    await mkdir(join(outDir, "ai"), { recursive: true });
    await writeFile(
      join(outDir, "ai", "tools.ts"),
      "export const aiTools = [] as const;\n",
    );

    await runGenerateAll(outDir);
    let content = await readFile(join(outDir, "index.ts"), "utf-8");
    expect(content).toContain(EXPORT_LINE);

    await rm(join(outDir, "ai"), { recursive: true, force: true });
    await runGenerateAll(outDir);
    content = await readFile(join(outDir, "index.ts"), "utf-8");
    expect(content).not.toContain(EXPORT_LINE);
  });

  it("is idempotent: a second run keeps exactly one export line", async () => {
    const outDir = join(parentOutDir, "idempotent");
    await cpForce(WITH_EDITORS, outDir);

    await mkdir(join(outDir, "ai"), { recursive: true });
    await writeFile(
      join(outDir, "ai", "tools.ts"),
      "export const aiTools = [] as const;\n",
    );

    await runGenerateAll(outDir);
    await runGenerateAll(outDir);
    const content = await readFile(join(outDir, "index.ts"), "utf-8");
    const matches = content.match(
      new RegExp(String.raw`export \{ aiTools \} from "\./ai/tools\.js";`, "g"),
    );
    expect(matches?.length).toBe(1);
  });
});
