import { DEFAULT_REGISTRY_URL } from "@powerhousedao/shared/clis";
import { publishArgs } from "@powerhousedao/shared/clis/args";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVersion } from "../src/get-version.js";
import {
  publishedFiles,
  revisionFiles,
  writeReleaseApproval,
} from "../src/services/release/files.js";
import {
  ALLOWED_NPM_ARGUMENTS,
  targetSelectingNpmEnvironment,
} from "../src/services/release/npm-args.js";
import { readTarball } from "../src/services/release/pack.js";
import { packageRevision } from "../src/services/release/revision.js";

vi.mock("@powerhousedao/shared/clis", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, getPowerhouseProjectInfo: vi.fn() };
});
vi.mock("@powerhousedao/shared/registry", () => ({
  resolveRegistryUrl: vi.fn(),
  checkNpmAuth: vi.fn(),
  npmPublish: vi.fn(),
}));
vi.mock("../src/services/registry-auth.js", () => ({
  mintRegistryAuthToken: vi.fn(() => Promise.reject(new Error("no renown"))),
}));

import { getPowerhouseProjectInfo } from "@powerhousedao/shared/clis";
import {
  checkNpmAuth,
  npmPublish,
  resolveRegistryUrl,
} from "@powerhousedao/shared/registry";

class Exit extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

const roots: string[] = [];
let output: { log: string[]; warn: string[]; error: string[] };

/** A built package, published as `ph init` publishes it. */
function builtPackage(): string {
  const parent = realpathSync.native(
    mkdtempSync(join(tmpdir(), "ph publish ")),
  );
  roots.push(parent);
  const root = join(parent, "my package");
  const files = {
    "package.json": JSON.stringify({
      name: "@fixture/published",
      version: "1.0.0",
      files: ["/dist"],
    }),
    "index.ts": "export const a = 1;\n",
    "dist/node/index.mjs": "export const a = 1;\n",
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  vi.mocked(getPowerhouseProjectInfo).mockResolvedValue({
    projectPath: root,
    localProjectPath: root,
    globalProjectPath: undefined,
    packageManager: "npm",
    isGlobal: false,
  });
  return root;
}

/** The approval `ph build --release` writes for the package as it is. */
function approve(root: string): void {
  writeReleaseApproval(root, {
    kind: "powerhouse.release-approval",
    formatVersion: 1,
    phCliVersion: getVersion(),
    outDir: "dist",
    packageRevision: {
      digest: packageRevision(revisionFiles(root, ["dist"]), {
        "ph-cli": getVersion(),
      }),
      excluded: [],
    },
    publishedFiles: publishedFiles(root),
    report: { profile: "release", status: "ok", definitions: [] },
    scalars: [],
    hostValidation: { completed: true, findings: [] },
  });
}

/** An approved package whose .npmrc then selects its workspace, `other`. */
function approvedWithNpmrcWorkspace(): string {
  const root = builtPackage();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "@fixture/published",
      version: "1.0.0",
      files: ["/dist"],
      workspaces: ["other"],
    }),
  );
  mkdirSync(join(root, "other"));
  writeFileSync(
    join(root, "other", "package.json"),
    JSON.stringify({ name: "@fixture/other", version: "1.0.0" }),
  );
  approve(root);
  writeFileSync(join(root, ".npmrc"), "workspace=other\n");
  return root;
}

const otherSelected = (root: string) =>
  `the release approval could not be checked: npm's configuration (a workspace setting in the environment or an .npmrc) selects a package other than the one in ${root}; the release approval covers that package only.`;

async function publish(
  args: { requireApproval?: boolean; forwardedArgs?: string[] } = {},
) {
  const { publish } = await import("../src/commands/publish.js");
  const { handler } = publish as unknown as {
    handler: (args: object) => Promise<void>;
  };
  return await handler({ forwardedArgs: [], ...args }).catch(
    (error: unknown) => error,
  );
}

const PUBLISHED = [`Publishing to ${DEFAULT_REGISTRY_URL}...`, "published"];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveRegistryUrl).mockReturnValue(DEFAULT_REGISTRY_URL);
  vi.mocked(checkNpmAuth).mockResolvedValue("testuser");
  vi.mocked(npmPublish).mockResolvedValue({ stdout: "published" });
  output = { log: [], warn: [], error: [] };
  for (const stream of ["log", "warn", "error"] as const) {
    vi.spyOn(console, stream).mockImplementation((...parts: unknown[]) => {
      output[stream].push(parts.map(String).join(" "));
    });
  }
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Exit(code === undefined ? undefined : Number(code));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("ph publish and the release approval", () => {
  it("publishes as it always has when the package has no approval", async () => {
    const root = builtPackage();

    expect(
      await publish({ forwardedArgs: ["../other", "--tag", "dev"] }),
    ).toEqual(new Exit(0));

    expect(output).toEqual({ log: PUBLISHED, warn: [], error: [] });
    expect(vi.mocked(npmPublish).mock.calls).toEqual([
      [
        {
          registryUrl: DEFAULT_REGISTRY_URL,
          cwd: root,
          args: ["../other", "--tag", "dev"],
          authToken: undefined,
        },
      ],
    ]);
  });

  it("says so and publishes when the approval matches, and warns with the reasons when it is stale", async () => {
    const root = builtPackage();
    approve(root);

    expect(await publish()).toEqual(new Exit(0));
    expect(output).toEqual({
      log: [
        "✔ approved: the release approval matches this package",
        ...PUBLISHED,
      ],
      warn: [],
      error: [],
    });

    output = { log: [], warn: [], error: [] };
    writeFileSync(
      join(root, "dist", "node", "index.mjs"),
      "export const a = 2;\n",
    );
    writeFileSync(join(root, "index.ts"), "export const a = 2;\n");

    expect(await publish()).toEqual(new Exit(0));

    expect(output).toEqual({
      log: PUBLISHED,
      warn: [
        [
          "⚠ stale: the release approval does not match this package",
          "  - the package's files changed since the approval was made",
          "  - 1 published file changed since the approval was made: dist/node/index.mjs",
          "Publishing anyway. Run ph build --release to approve this package, or pass --require-approval to stop here instead.",
        ].join("\n"),
      ],
      error: [],
    });
    expect(vi.mocked(npmPublish).mock.calls.map(([{ args }]) => args)).toEqual([
      [],
      [],
    ]);
  });

  it("with --require-approval, exits 1 before the registry and auth when there is no approval", async () => {
    builtPackage();

    expect(await publish({ requireApproval: true })).toEqual(new Exit(1));

    expect(output).toEqual({
      log: [],
      warn: [],
      error: [
        [
          "✘ missing: this package has no release approval",
          "  - there is no release approval (.ph/build/release-approval.json); ph build --release writes one",
          "ph publish --require-approval publishes only an approved package. Run ph build --release, then publish again.",
        ].join("\n"),
      ],
    });
    expect(resolveRegistryUrl).not.toHaveBeenCalled();
    expect(checkNpmAuth).not.toHaveBeenCalled();
    expect(npmPublish).not.toHaveBeenCalled();
  });

  it("with --require-approval, exits 1 on a stale approval", async () => {
    const root = builtPackage();
    approve(root);
    writeFileSync(join(root, "dist", "extra.js"), "");

    expect(await publish({ requireApproval: true })).toEqual(new Exit(1));
    expect(output.error).toEqual([
      [
        "✘ stale: the release approval does not match this package",
        "  - 1 published file added since the approval was made: dist/extra.js",
        "ph publish --require-approval publishes only an approved package. Run ph build --release, then publish again.",
      ].join("\n"),
    ]);
    expect(checkNpmAuth).not.toHaveBeenCalled();
  });

  it("with --require-approval, exits 1 when npm's configuration keeps the approval from being checked", async () => {
    const root = approvedWithNpmrcWorkspace();

    expect(await publish({ requireApproval: true })).toEqual(new Exit(1));

    expect(output.error).toEqual([
      `✘ ${otherSelected(root)}\nph publish --require-approval publishes only an approved package. Run ph build --release, then publish again.`,
    ]);
    expect(checkNpmAuth).not.toHaveBeenCalled();
  });

  it("warns and publishes when npm's configuration keeps the approval from being checked", async () => {
    const root = approvedWithNpmrcWorkspace();

    expect(await publish()).toEqual(new Exit(0));

    expect(output.warn).toEqual([
      `⚠ ${otherSelected(root)}\nPublishing anyway. Run ph build --release to approve this package, or pass --require-approval to stop here instead.`,
    ]);
    expect(vi.mocked(npmPublish).mock.calls.map(([{ args }]) => args)).toEqual([
      [],
    ]);
  });

  it("with --require-approval, refuses npm arguments outside its list, before auth", async () => {
    builtPackage();

    expect(
      await publish({
        requireApproval: true,
        forwardedArgs: ["--tag", "dev", "../other package"],
      }),
    ).toEqual(new Exit(1));

    expect(output.error).toEqual([
      "✘ ph publish --require-approval publishes only the package it checked, so it forwards only these npm arguments: --tag <tag>, --access <public|restricted>, --otp <code>, --dry-run, --provenance, --json, --loglevel <level>. Not allowed: ../other package",
    ]);
    expect(checkNpmAuth).not.toHaveBeenCalled();
    expect(npmPublish).not.toHaveBeenCalled();
  });

  it("with --require-approval, refuses npm configuration in the environment that selects another package, before auth", async () => {
    approve(builtPackage());
    vi.stubEnv("npm_config_workspace", "other");
    vi.stubEnv("NPM_CONFIG_WORKSPACES", "true");
    vi.stubEnv("npm_config_include-workspace-root", "true");

    expect(await publish({ requireApproval: true })).toEqual(new Exit(1));

    expect(output.error).toEqual([
      "✘ ph publish --require-approval publishes only the package it checked, but the environment sets npm configuration that selects another package: NPM_CONFIG_WORKSPACES, npm_config_include-workspace-root, npm_config_workspace. Unset it and publish again.",
    ]);
    expect(checkNpmAuth).not.toHaveBeenCalled();
    expect(npmPublish).not.toHaveBeenCalled();
  });

  it("with --require-approval, publishes the tarball it checked with lifecycle scripts skipped, and says so", async () => {
    const root = builtPackage();
    approve(root);
    // npm run sets it to the global prefix, which selects no other package.
    vi.stubEnv("npm_config_prefix", "/usr/local");
    let tarball = "";
    vi.mocked(npmPublish).mockImplementationOnce(({ args }) => {
      tarball = args?.[0] ?? "";
      expect(existsSync(tarball)).toBe(true);
      return Promise.resolve({ stdout: "published" });
    });

    expect(
      await publish({
        requireApproval: true,
        forwardedArgs: ["--tag", "dev", "--access=public"],
      }),
    ).toEqual(new Exit(0));

    expect(output.log).toEqual([
      "✔ approved: the release approval matches this package",
      "Lifecycle scripts are skipped (--ignore-scripts) and workspaces are off (--workspaces=false), so npm publishes the tarball the approval matched.",
      ...PUBLISHED,
    ]);
    expect(tarball.endsWith("fixture-published-1.0.0.tgz")).toBe(true);
    expect(vi.mocked(npmPublish).mock.calls).toEqual([
      [
        {
          registryUrl: DEFAULT_REGISTRY_URL,
          cwd: root,
          args: [
            tarball,
            "--tag",
            "dev",
            "--access=public",
            "--ignore-scripts",
            "--workspaces=false",
          ],
          authToken: undefined,
        },
      ],
    ]);
    expect(existsSync(tarball)).toBe(false);
  });

  it("with --require-approval, publishes the bytes it checked when a file changes while auth is pending", async () => {
    const root = builtPackage();
    approve(root);
    vi.mocked(checkNpmAuth).mockImplementationOnce(() => {
      writeFileSync(
        join(root, "dist", "node", "index.mjs"),
        "export const a = 999;\n",
      );
      return Promise.resolve("testuser");
    });
    let published: string | undefined;
    vi.mocked(npmPublish).mockImplementationOnce(({ args }) => {
      published = readTarball(args?.[0] ?? "")
        .get("dist/node/index.mjs")
        ?.toString("utf8");
      return Promise.resolve({ stdout: "published" });
    });

    expect(await publish({ requireApproval: true })).toEqual(new Exit(0));

    expect(published).toBe("export const a = 1;\n");
  });
});

describe("ph publish --help", () => {
  it("names, for --require-approval, each npm argument it forwards and each npm environment variable it refuses", async () => {
    const { publish } = await import("../src/commands/publish.js");
    const forwarded = ALLOWED_NPM_ARGUMENTS.split(", ").map(
      (argument) => argument.split(" ")[0],
    );
    const refused = targetSelectingNpmEnvironment({
      npm_config_workspace: "other",
      npm_config_workspaces: "true",
      npm_config_include_workspace_root: "true",
      npm_config_prefix: "/usr/local",
      npm_config_registry: "https://registry.example",
    });
    const texts = {
      command: (publish as { description?: string }).description ?? "",
      flag: publishArgs.requireApproval.description ?? "",
    };

    for (const [where, text] of Object.entries(texts)) {
      const missing = [...forwarded, ...refused].filter(
        (name) => !text.includes(name),
      );
      expect([where, missing]).toEqual([where, []]);
    }
  });
});
