import { realPathThroughExistingParent } from "@powerhousedao/shared/clis/real-paths";
import { basename, dirname, join, resolve, sep } from "node:path";

export function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

export function canonicalConfigFile(configFile: string): string {
  const absolute = resolve(configFile);
  return join(
    realPathThroughExistingParent(dirname(absolute)),
    basename(absolute),
  );
}
