import { type Project } from "@pnpm/find-workspace-packages";

export type CodegenOptions = {
  verbose?: boolean;
  force?: boolean;
};

export type DocumentTypesMap = Record<
  string,
  { name: string; importPath: string }
>;

declare global {
  const WORKSPACE_PACKAGES: {
    dir: string;
    manifest: Project["manifest"];
  }[];
}
