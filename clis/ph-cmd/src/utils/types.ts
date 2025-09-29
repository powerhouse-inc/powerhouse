export type ProjectInfo = {
  isGlobal: boolean;
  available: boolean;
  path: string;
};

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

export type PathValidation = (dir: string) => boolean;

export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export type GlobalProjectOptions = {
  project?: string;
  interactive?: boolean;
  version?: string;
  dev?: boolean;
  staging?: boolean;
  packageManager?: string;
};
