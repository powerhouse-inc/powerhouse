import { homedir } from "node:os";
import path from "node:path";

export const PH_BIN_PATH = process.argv[1];
export const PH_BIN = "ph-cli";
export const PH_CLI_COMMANDS = [
  "init",
  "dev",
  "connect",
  "generate",
  "reactor",
  "switchboard",
  "help",
  "install",
  "add",
  "i",
  "remove",
  "uninstall",
  "service",
  "list",
  "inspect",
  "version",
  "login",
];
export const POWERHOUSE_CONFIG_FILE = "powerhouse.config.json";
export const HOME_DIR = homedir();
export const PH_GLOBAL_DIR_NAME = ".ph";
export const PH_GLOBAL_PACKAGE_NAME = "ph-global";
// Keep PH_GLOBAL_PROJECT_NAME for backwards compatibility
export const PH_GLOBAL_PROJECT_NAME = PH_GLOBAL_DIR_NAME;
export const POWERHOUSE_GLOBAL_DIR = path.join(HOME_DIR, PH_GLOBAL_DIR_NAME);

export const packageManagers = {
  bun: {
    installCommand: "bun add {{dependency}}",
    execCommand: `bun ${PH_BIN} {{arguments}}`,
    execScript: `bun {{arguments}}`,
    lockfile: "bun.lock",
    globalPathRegexp: /[\\/].bun[\\/]/,
    updateCommand: "bun update {{dependency}}",
    buildAffected: "bun run build:affected",
    workspaceOption: "",
    installDepsCommand: "bun install",
  },
  pnpm: {
    installCommand: "pnpm add {{dependency}}",
    execCommand: `pnpm exec ${PH_BIN} {{arguments}}`,
    execScript: `pnpm {{arguments}}`,
    lockfile: "pnpm-lock.yaml",
    globalPathRegexp: /[\\/]pnpm[\\/]/,
    updateCommand: "pnpm update {{dependency}}",
    buildAffected: "pnpm run build:affected",
    workspaceOption: "--workspace-root",
    installDepsCommand: "pnpm install",
  },
  yarn: {
    installCommand: "yarn add {{dependency}}",
    execCommand: `yarn ${PH_BIN} {{arguments}}`,
    execScript: `yarn {{arguments}}`,
    lockfile: "yarn.lock",
    globalPathRegexp: /[\\/]yarn[\\/]/,
    updateCommand: "yarn upgrade {{dependency}}",
    buildAffected: "yarn run build:affected",
    workspaceOption: "-W",
    installDepsCommand: "yarn install",
  },
  npm: {
    installCommand: "npm install {{dependency}}",
    execCommand: `npx ${PH_BIN} {{arguments}}`,
    execScript: `npm run {{arguments}}`,
    lockfile: "package-lock.json",
    updateCommand: "npm update {{dependency}} --save",
    buildAffected: "npm run build:affected",
    workspaceOption: "",
    installDepsCommand: "npm install",
  },
} as const;

export const PACKAGES_DEPENDENCIES = [
  "@powerhousedao/builder-tools",
  "@powerhousedao/codegen",
  "@powerhousedao/common",
  "@powerhousedao/config",
  "@powerhousedao/design-system",
  "document-drive",
  "document-model",
  "@powerhousedao/reactor",
  "@powerhousedao/reactor-api",
  "@powerhousedao/reactor-browser",
  "@powerhousedao/reactor-local",
  "@powerhousedao/reactor-mcp",
  "@powerhousedao/switchboard-gui",
  "@powerhousedao/vetra",
] as const;

export const CLIS_DEPENDENCIES = ["ph-cmd", "@powerhousedao/ph-cli"];
export const APPS_DEPENDENCIES = [
  "@powerhousedao/connect",
  "@powerhousedao/switchboard",
];

export const ALL_POWERHOUSE_DEPENDENCIES = [
  ...PACKAGES_DEPENDENCIES,
  ...CLIS_DEPENDENCIES,
  ...APPS_DEPENDENCIES,
];
