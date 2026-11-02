import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

// tsc ends its lines with \r\n on Windows.
const lines = (stdout: string) => stdout.split(/\r?\n/);

export function listedFiles(stdout = "", directory = "."): string[] {
  return lines(stdout)
    .map((line) => line.trim())
    .map((line) => resolve(directory, line))
    .filter((line) => existsSync(line) && statSync(line).isFile());
}

export function explainedRoots(stdout: string, directory: string): string[] {
  const roots: string[] = [];
  let file: string | undefined;
  for (const line of lines(stdout)) {
    if (
      line !== "" &&
      line === line.trim() &&
      /\.(?:[cm]?[jt]sx?|json)$/i.test(line)
    ) {
      const path = resolve(directory, line);
      file = statSync(path, { throwIfNoEntry: false })?.isFile()
        ? path
        : undefined;
    } else if (
      file !== undefined &&
      /Root file specified|Part of 'files' list|Matched by (default )?include pattern/.test(
        line,
      )
    ) {
      roots.push(file);
    }
  }
  return roots;
}
