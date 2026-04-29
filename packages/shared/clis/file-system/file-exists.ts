import type { Dirent } from "node:fs";
import { statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { isTruthy } from "remeda";
export async function fileExists(path: string | null | undefined) {
  if (!path) return false;
  try {
    const stats = await stat(path);
    if (stats.isFile()) return true;
  } catch (e) {
    return false;
  }
  return false;
}

export function fileExistsSync(
  path: string | null | undefined,
): path is string {
  if (!isTruthy(path)) return false;
  return statSync(path, { throwIfNoEntry: false })?.isFile() === true;
}

export function isFile(dirent: Dirent | undefined | null): dirent is Dirent {
  return dirent?.isFile() === true;
}
