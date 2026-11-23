import fs from "node:fs";
import path from "node:path";

/**
 * Service state lives under the data folder (`<data folder>/.ph/<cli>/
 * services`). Before 6.4 it was the user's, `~/.ph/<cli>/services`, shared
 * by every project. State found there is not read and never deleted: it is
 * reported once per data folder, when it is this project's.
 */

const REPORTED_MARKER = ".legacy-state-reported";

const samePath = (a: string, b: string) => {
  const [x, y] = [path.resolve(a), path.resolve(b)];
  return process.platform === "win32"
    ? x.toLowerCase() === y.toLowerCase()
    : x === y;
};

/** The state files at the old location that this project would have read:
 * those of its working folder, and those of no folder. */
export function legacyServiceState(
  legacyDir: string,
  workdir: string,
): string[] {
  const found: string[] = [];
  let services: fs.Dirent[];
  try {
    services = fs.readdirSync(legacyDir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const service of services) {
    if (!service.isDirectory()) continue;
    const dir = path.join(legacyDir, service.name);
    let files: string[];
    try {
      files = fs.readdirSync(dir).filter((file) => file.endsWith(".json"));
    } catch {
      continue;
    }
    for (const file of files) {
      const at = path.join(dir, file);
      try {
        const state = JSON.parse(fs.readFileSync(at, "utf8")) as {
          workdir?: unknown;
        };
        if (
          typeof state.workdir !== "string" ||
          samePath(state.workdir, workdir)
        ) {
          found.push(at);
        }
      } catch {
        // not a state file
      }
    }
  }
  return found;
}

/**
 * Reports this project's state at the old location, once: a marker in the
 * new services folder remembers it. Returns the report, undefined when
 * there is nothing to say (or it was said).
 */
export function reportLegacyServiceState(args: {
  legacyDir: string;
  servicesDir: string;
  workdir: string;
  warn: (message: string) => void;
}): string | undefined {
  const { legacyDir, servicesDir, workdir } = args;
  if (samePath(legacyDir, servicesDir)) return undefined;
  const marker = path.join(servicesDir, REPORTED_MARKER);
  if (fs.existsSync(marker)) return undefined;
  const found = legacyServiceState(legacyDir, workdir);
  if (found.length === 0) return undefined;
  const message =
    `Service state of an earlier version is at ${legacyDir} (${found.length} file(s) for this project). ` +
    `It is not read any more: service state is now kept per project, in ${servicesDir}. ` +
    `Nothing was deleted or moved; remove the old folder once no earlier version uses it.`;
  args.warn(message);
  try {
    fs.mkdirSync(servicesDir, { recursive: true });
    fs.writeFileSync(marker, `${new Date().toISOString()}\n`);
  } catch {
    // It is said again next time.
  }
  return message;
}
