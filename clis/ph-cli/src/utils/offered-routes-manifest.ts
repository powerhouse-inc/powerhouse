import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The manifest flags `ph build` sets from what it built. */
type BuildFlag = "connectRoutes" | "cli";

// The manifest with `flag` set when `on`; as it is, byte for byte, when the
// flag is already right.
function withFlag(json: string, flag: BuildFlag, on: boolean) {
  const manifest = JSON.parse(json) as Partial<Record<BuildFlag, boolean>>;
  if (on ? manifest[flag] === true : !(flag in manifest)) return json;
  if (on) manifest[flag] = true;
  else delete manifest[flag];
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

const slashes = (path: string) => path.replaceAll("\\", "/");

/** Sets `connectRoutes` in the manifest the package's root module imports,
 * leaving the project's file as it is. */
export function offeredRoutesManifest(projectRoot: string, offers: boolean) {
  // Vite's ids use forward slashes on Windows too.
  const manifestPath = slashes(join(projectRoot, "powerhouse.manifest.json"));
  return {
    name: "ph-offered-routes-manifest",
    transform(code: string, id: string) {
      if (slashes(id) !== manifestPath) return null;
      return {
        code: withFlag(code, "connectRoutes", offers),
        map: null,
      };
    },
  };
}

function markDistManifest(dir: string, flag: BuildFlag, on: boolean) {
  const manifestPath = join(dir, "powerhouse.manifest.json");
  if (!existsSync(manifestPath)) return;
  const json = readFileSync(manifestPath, "utf-8");
  writeFileSync(manifestPath, withFlag(json, flag, on));
}

/** Sets `connectRoutes` in the dist copy of the manifest. */
export function markOfferedRoutes(dir: string, offers: boolean) {
  markDistManifest(dir, "connectRoutes", offers);
}

/** Sets `cli` in the dist copy of the manifest: the package exports a Cli. */
export function markCliExport(dir: string, ships: boolean) {
  markDistManifest(dir, "cli", ships);
}
