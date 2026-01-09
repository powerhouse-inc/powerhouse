import { constants } from "node:fs";
import { access } from "node:fs/promises";

export async function dirExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
