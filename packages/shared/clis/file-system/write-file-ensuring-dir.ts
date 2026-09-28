import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "path";

export async function writeFileEnsuringDir(
  filePath: string,
  contents: string | Buffer,
) {
  // Resolved first: bun on Windows fails `mkdir(".", { recursive: true })` with ENOENT.
  await mkdir(dirname(resolve(filePath)), { recursive: true });
  await writeFile(filePath, contents, { encoding: "utf-8" });
}
