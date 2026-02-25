import { createRequire } from "module";
import path from "path";
export function resolvePackage(packageName: string, root = process.cwd()) {
  // find connect installation
  const require = createRequire(root);
  return require.resolve(packageName, { paths: [root] });
}
export function resolveConnectPublicDir(root = process.cwd()) {
  const connectIconPath = resolvePackage(
    "@powerhousedao/connect/public/icon.ico",
    root,
  );
  return path.join(connectIconPath, "../");
}

export function resolveViteConfigPath(options: {
  projectRoot?: string;
  viteConfigFile?: string;
}) {
  const { projectRoot = process.cwd(), viteConfigFile } = options;
  return viteConfigFile || path.join(projectRoot, "vite.config.ts");
}
