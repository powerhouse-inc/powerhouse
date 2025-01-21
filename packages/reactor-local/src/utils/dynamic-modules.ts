import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
export async function loadModuleSpecifier(specifier: string) {
  if (typeof specifier !== "string") {
    throw new Error("specifier expected");
  }
  try {
    const mod = (await import(specifier)) as unknown;
    return mod;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      typeof err.code === "string" &&
      ["MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND"].includes(err.code)
    ) {
      console.error("MODULE_NOT_FOUND", err);
      return null;
    } else {
      throw err;
    }
  }
}

export function requireGlobal(packageName: string) {
  const globalNodeModules = execSync("npm root -g").toString().trim();
  let packageDir = path.join(globalNodeModules, packageName);
  if (!fs.existsSync(packageDir))
    packageDir = path.join(globalNodeModules, "npm/node_modules", packageName); //find package required by old npm

  if (!fs.existsSync(packageDir))
    throw new Error("Cannot find global module '" + packageName + "'");

  const packageMeta = JSON.parse(
    fs.readFileSync(path.join(packageDir, "package.json")).toString(),
  ) as { main: string };
  const main = path.join(packageDir, packageMeta.main);

  return import(main);
}
