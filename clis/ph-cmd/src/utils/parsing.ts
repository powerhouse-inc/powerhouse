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
