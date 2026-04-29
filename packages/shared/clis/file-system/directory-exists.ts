import type { Dirent } from "node:fs";
import { statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { isTruthy } from "remeda";
export async function directoryExists(path: string | null | undefined) {
  if (!path) return false;
  try {
    const stats = await stat(path);
    if (stats.isDirectory()) return true;
  } catch (e) {
    return false;
  }
  return false;
}

export function directoryExistsSync(
  path: string | null | undefined,
): path is string {
  if (!isTruthy(path)) return false;
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;
}

export function isDirectory(
  dirent: Dirent | undefined | null,
): dirent is Dirent {
  return dirent?.isDirectory() === true;
}
