export function parseTag(args: {
  tag?: string;
  dev?: boolean;
  staging?: boolean;
}) {
  const { tag, dev, staging } = args;
  if (tag) return tag;
  if (dev) return "dev";
  if (staging) return "staging";
  return "latest";
}

export function parsePackageManager(args: {
  packageManager?: string;
  npm?: boolean;
  pnpm?: boolean;
  yarn?: boolean;
  bun?: boolean;
}) {
  const { npm, pnpm, yarn, bun, packageManager } = args;
  if (npm) return "npm";
  if (pnpm) return "pnpm";
  if (yarn) return "yarn";
  if (bun) return "bun";
  if (packageManager) return packageManager;
  const userAgentPackageManager = process.env.npm_config_user_agent?.match(
    /^(pnpm|npm|yarn|bun)\b/,
  )?.[1];
  if (userAgentPackageManager) return userAgentPackageManager;
  return undefined;
}

export function handleMutuallyExclusiveOptions(
  options: Record<string, string | boolean | number | undefined>,
  optionsName: string,
) {
  const mutuallyExclusiveOptions = Object.entries(options)
    .map(([k, v]) => {
      if (v !== undefined) return k;
      return undefined;
    })
    .filter((v) => v !== undefined);

  if (mutuallyExclusiveOptions.length > 1) {
    throw new Error(
      `Cannot specify multiple ${optionsName} options. You provided: ${mutuallyExclusiveOptions.join(", ")}`,
    );
  }
}

export function getTagFromVersion(version: string) {
  if (version.includes("dev")) return "dev";
  if (version.includes("staging")) return "staging";
  return "latest";
}

export function logVersionUpdate(args: {
  name: string;
  version: string;
  newVersion: string;
}) {
  const { name, version, newVersion } = args;
  console.log(`Updating ${name}: ${version} -> ${newVersion}`);
}
