import { stat } from "node:fs/promises";
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
