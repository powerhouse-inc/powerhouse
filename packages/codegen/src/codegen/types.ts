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
  /* Define the directories and package.json contents of the packages in the monorepo.
   * Useful for knowing the names and versions of our packages in cli tools.
   */
  const WORKSPACE_PACKAGES: {
    dir: string;
    manifest: Project["manifest"];
  }[];
}
