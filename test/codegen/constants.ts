import { findWorkspaceDir } from "@pnpm/find-workspace-dir";
import { join } from "path";
export const WORKSPACE_DIR = await findWorkspaceDir(process.cwd());
export const CODEGEN_TESTS_PACKAGE_DIR = join(
  WORKSPACE_DIR!,
  "test",
  "codegen",
);

export const TEST_PROJECTS = join(CODEGEN_TESTS_PACKAGE_DIR, "test-projects");
export const TEST_OUTPUT = join(CODEGEN_TESTS_PACKAGE_DIR, "test-output");
export const DATA = join(CODEGEN_TESTS_PACKAGE_DIR, "data");
export const NEW_PROJECT = join(TEST_PROJECTS, "new-project");

export const WITH_DOCUMENT_MODELS_SPEC_1 = join(
  TEST_PROJECTS,
  "with-document-models-spec-1",
);
export const WITH_DOCUMENT_MODELS_SPEC_2 = join(
  TEST_PROJECTS,
  "with-document-models-spec-2",
);
export const WITH_EDITORS = join(TEST_PROJECTS, "with-editors");
export const DOCUMENT_MODELS = join(DATA, "document-models");

export const SPEC_VERSION_1 = join(DATA, "spec-version-1");

export const SPEC_VERSION_2 = join(DATA, "spec-version-2");
export const SPEC_VERSION_3 = join(DATA, "spec-version-3");
