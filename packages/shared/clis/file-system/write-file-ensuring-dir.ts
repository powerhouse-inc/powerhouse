import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "path";

export async function writeFileEnsuringDir(
  filePath: string,
  contents: string | Buffer,
) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, { encoding: "utf-8" });
}
