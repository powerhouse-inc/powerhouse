import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The manifest with `connectRoutes` set when the package offers routes; as it
// is, byte for byte, when the flag is already right.
function withOfferedRoutes(json: string, offers: boolean) {
  const manifest = JSON.parse(json) as { connectRoutes?: boolean };
  if (offers ? manifest.connectRoutes === true : !("connectRoutes" in manifest))
    return json;
  if (offers) manifest.connectRoutes = true;
  else delete manifest.connectRoutes;
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
      return { code: withOfferedRoutes(code, offers), map: null };
    },
  };
}

/** Sets `connectRoutes` in the dist copy of the manifest. */
export function markOfferedRoutes(dir: string, offers: boolean) {
  const manifestPath = join(dir, "powerhouse.manifest.json");
  if (!existsSync(manifestPath)) return;
  const json = readFileSync(manifestPath, "utf-8");
  writeFileSync(manifestPath, withOfferedRoutes(json, offers));
}
