import path from "path";

export function resolveViteConfigPath(options: {
  projectRoot?: string;
  viteConfigFile?: string;
}) {
  const { projectRoot = process.cwd(), viteConfigFile } = options;
  return viteConfigFile || path.join(projectRoot, "vite.config.ts");
}
