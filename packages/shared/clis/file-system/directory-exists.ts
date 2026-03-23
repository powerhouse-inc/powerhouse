import { stat } from "node:fs/promises";
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
