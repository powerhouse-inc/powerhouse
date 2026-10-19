import spawn from "cross-spawn";
import { resolve as resolvePath } from "node:path";

const installs = new Map<string, Promise<void>>();

export type InstallOptions = {
  readonly skipInstall?: boolean;
  /** Set false in hosts that cannot answer package-manager prompts. */
  readonly interactive?: boolean;
};

/** Reports failed installs without throwing because the generated files are already written. */
export async function installAddedDependencies(
  added: readonly string[],
  projectDir: string,
  options: InstallOptions = {},
) {
  if (added.length === 0) return;
  const key = resolvePath(projectDir);
  const pending = (installs.get(key) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => runInstall(key, options));
  installs.set(key, pending);
  try {
    await pending;
  } finally {
    if (installs.get(key) === pending) installs.delete(key);
  }
}

async function runInstall(
  projectDir: string,
  { skipInstall, interactive = true }: InstallOptions,
) {
  const { detect, resolveCommand } = await import("package-manager-detector");
  const agent = (await detect({ cwd: projectDir }))?.agent ?? "npm";
  const resolved = resolveCommand(agent, "install", []);
  if (!resolved) return;
  const printed = [resolved.command, ...resolved.args].join(" ");
  if (skipInstall) {
    console.log(`Run \`${printed}\` to install them.`);
    return;
  }
  console.log(`Installing with \`${printed}\`...`);
  const status = await new Promise<number | null>((resolve) => {
    const child = spawn(resolved.command, resolved.args, {
      cwd: projectDir,
      stdio: [interactive ? "inherit" : "ignore", "inherit", "inherit"],
    });
    child.on("error", () => resolve(null));
    child.on("close", resolve);
  });
  if (status !== 0) {
    console.warn(
      `Install failed. Run \`${printed}\` in ${projectDir} to install them.`,
    );
  }
}
