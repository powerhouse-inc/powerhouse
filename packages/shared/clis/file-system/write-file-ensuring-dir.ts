import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "path";
import { projectFiles } from "./write-layer.js";

export async function writeFileEnsuringDir(
  filePath: string,
  contents: string | Buffer,
) {
  // A dry run records the write instead (see recordWrites).
  if (projectFiles.isRecording()) {
    projectFiles.writeSync(filePath, contents);
    return;
  }
  // Resolved first: bun on Windows fails `mkdir(".", { recursive: true })` (ENOENT on 1.3.8, EEXIST on 1.3.14).
  await mkdir(dirname(resolve(filePath)), { recursive: true });
  await writeFile(filePath, contents, { encoding: "utf-8" });
}
