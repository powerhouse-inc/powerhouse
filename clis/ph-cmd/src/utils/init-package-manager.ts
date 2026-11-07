import type { Agent } from "package-manager-detector";

export type DetectFn = (options: { allowed?: readonly Agent[] }) => {
  pm: Agent;
  source: "user-agent" | "install" | "path" | "fallback";
};

export interface InitPackageManagerArgs {
  packageManager?: Agent;
  npm?: boolean;
  pnpm?: boolean;
  yarn?: boolean;
  bun?: boolean;
  clone?: string;
}

/**
 * Decides which package manager `ph init` runs ph-cli with, and which flag
 * to forward so ph-cli installs the project's dependencies with the same one.
 *
 * An explicit flag wins and nothing is forwarded (the user's own flag already
 * reaches ph-cli). With none, the detected manager is forwarded as `--<pm>`.
 * `--clone` only works with pnpm or npm, so detection is limited to those.
 */
export function resolveInitPackageManager(
  args: InitPackageManagerArgs,
  detect: DetectFn,
): {
  pm: Agent;
  forwardedFlags: string[];
  detectedFrom?: "user-agent" | "install" | "path";
} {
  const { npm, pnpm, yarn, bun, packageManager } = args;
  const explicit: Agent | undefined = npm
    ? "npm"
    : pnpm
      ? "pnpm"
      : yarn
        ? "yarn"
        : bun
          ? "bun"
          : packageManager;
  if (explicit) {
    return { pm: explicit, forwardedFlags: [], detectedFrom: undefined };
  }

  const detected = detect(args.clone ? { allowed: ["pnpm", "npm"] } : {});
  // ph-cli rejects two package-manager keys, and `--npm=false` counts as one.
  const userSetAnyKey = [npm, pnpm, yarn, bun].some((v) => v !== undefined);
  return {
    pm: detected.pm,
    forwardedFlags: userSetAnyKey ? [] : [`--${detected.pm}`],
    detectedFrom: detected.source === "fallback" ? undefined : detected.source,
  };
}
