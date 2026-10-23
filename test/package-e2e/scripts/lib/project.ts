import path from "node:path";

// Use /tmp so pnpm doesn't pick the project up via the monorepo workspace globs.
export const PROJECT_PARENT =
  process.env.PH_PROJECT_PARENT ?? "/tmp/ph-pkg-e2e";
export const PROJECT_NAME = process.env.PH_PKG_NAME ?? "test-todo-package";
/** The project publish-package.ts scaffolds with `ph init`, from the registry. */
export const PROJECT_DIR = path.join(PROJECT_PARENT, PROJECT_NAME);
