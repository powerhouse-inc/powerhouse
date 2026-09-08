import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyRetirementPlan,
  createRetirementPlan,
} from "../../src/tooling/retirement.js";

const FAMILY_DIGEST = `sha256:${"a".repeat(64)}` as const;
const ARTIFACT_DIGEST = `sha256:${"b".repeat(64)}` as const;
const created: string[] = [];

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
}

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ph-retirement-"));
  created.push(root);
  await mkdir(resolve(root, "document-models/legacy"), { recursive: true });
  await writeFile(
    resolve(root, "document-models/legacy/model.ts"),
    "export {};\n",
    "utf8",
  );
  await Promise.all([
    writeJson(resolve(root, ".ph/equivalence.json"), {
      status: "equivalent",
      familyDigest: FAMILY_DIGEST,
    }),
    writeJson(resolve(root, ".ph/activation.json"), {
      status: "active",
      familyDigest: FAMILY_DIGEST,
      artifactDigest: ARTIFACT_DIGEST,
    }),
    writeJson(resolve(root, ".ph/rollback.json"), {
      status: "pass",
      familyDigest: FAMILY_DIGEST,
      artifactDigest: ARTIFACT_DIGEST,
    }),
    writeJson(resolve(root, ".ph/canary.json"), {
      status: "pass",
      familyDigest: FAMILY_DIGEST,
      artifactDigest: ARTIFACT_DIGEST,
    }),
  ]);
  return root;
}

function request(root: string) {
  return {
    packageRoot: root,
    legacyFamilyRoot: "document-models/legacy",
    repositoryCommit: "test-commit",
    documentType: "test/legacy",
    familyDigest: FAMILY_DIGEST,
    approvedReportPath: ".ph/equivalence.json",
    activationMarkerPath: ".ph/activation.json",
    rollbackReportPath: ".ph/rollback.json",
    canaryReportPath: ".ph/canary.json",
    recoverableLegacyRoot: "git:test-commit:document-models/legacy",
    liveImportPaths: [],
    maskedVerificationPassed: true,
  } as const;
}

afterEach(async () => {
  await Promise.all(
    created.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("legacy retirement boundaries", () => {
  it("rejects an escaping evidence path before attempting to read it", async () => {
    const root = await createFixture();

    await expect(
      createRetirementPlan({
        ...request(root),
        approvedReportPath: "../outside.json",
      }),
    ).rejects.toMatchObject({ code: "PH-MIGRATE-RETIRE-PATH-OUTSIDE-ROOT" });
  });

  it("rejects a legacy root replaced by a symlink after approval", async () => {
    const root = await createFixture();
    const plan = await createRetirementPlan(request(root));
    const legacyRoot = resolve(root, "document-models/legacy");
    const movedRoot = resolve(root, "document-models/legacy-real");
    await rename(legacyRoot, movedRoot);
    await symlink(movedRoot, legacyRoot, "dir");

    await expect(
      applyRetirementPlan({
        packageRoot: root,
        plan,
        currentCommit: "test-commit",
      }),
    ).rejects.toMatchObject({ code: "PH-MIGRATE-RETIRE-SYMLINK" });
  });

  it("rejects an intermediate legacy-root symlink", async () => {
    const root = await createFixture();
    const documentModels = resolve(root, "document-models");
    const moved = resolve(root, "document-models-real");
    await rename(documentModels, moved);
    await symlink(moved, documentModels, "dir");

    await expect(createRetirementPlan(request(root))).rejects.toMatchObject({
      code: "PH-MIGRATE-RETIRE-SYMLINK",
    });
  });

  it("rejects a symlinked staging ancestor after approval", async () => {
    const root = await createFixture();
    const plan = await createRetirementPlan(request(root));
    const metadataRoot = resolve(root, ".ph");
    const moved = resolve(root, ".ph-real");
    await rename(metadataRoot, moved);
    await symlink(moved, metadataRoot, "dir");

    await expect(
      applyRetirementPlan({
        packageRoot: root,
        plan,
        currentCommit: "test-commit",
      }),
    ).rejects.toMatchObject({ code: "PH-MIGRATE-RETIRE-SYMLINK" });
  });
});
