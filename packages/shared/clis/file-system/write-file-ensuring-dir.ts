import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "path";

export async function writeFileEnsuringDir(
  filePath: string,
  contents: string | Buffer,
) {
  // Resolved first: bun on Windows fails `mkdir(".", { recursive: true })` (ENOENT on 1.3.8, EEXIST on 1.3.14).
  await mkdir(dirname(resolve(filePath)), { recursive: true });
  await writeFile(filePath, contents, { encoding: "utf-8" });
}
