import { boolean, command, flag, oneOf, option, run } from "cmd-ts";
import { ReleaseClient } from "nx/release";
import type { ReleaseType } from "semver";

type Channel = "dev" | "staging" | "production";
const modes = ["prerelease", "patch", "minor", "major"] as const;
type Mode = (typeof modes)[number];

function getSpecifier(channel: Channel, mode: Mode): ReleaseType {
  if (channel === "production" && mode === "prerelease") {
    throw new Error("Cannot do a prerelease on production");
  }
  if (channel === "production") return mode;
  if (mode === "prerelease") return mode;
  return `pre${mode}`;
}

function getBranchName(): string {
  const fromEnv = process.env.GITHUB_REF_NAME?.trim();
  if (!fromEnv) {
    throw new Error("Failed to read current git branch from action env.");
  }
  return fromEnv;
}

function getReleaseChannelFromBranchName(branchName: string): Channel {
  if (branchName === "main") return "dev";

  const [releaseSignifier, tag, version] = branchName.split("/");

  if (releaseSignifier !== "release") {
    throw new Error(
      `Branch name "${branchName}" is invalid. Release branches must start with release/.`,
    );
  }

  if (tag !== "staging" && tag !== "production") {
    throw new Error(
      `Branch "${branchName}" has an invalid tag. Must be either "release/staging/" or "release/production/"`,
    );
  }

  if (!version) {
    throw new Error(`Branch "${branchName}" does not have a version.`);
  }

  return tag;
}

function getPreid(channel: Channel): string | undefined {
  if (channel === "production") return undefined;
  return channel;
}

const app = command({
  name: "run-release",
  description: "Runs Nx release with channel-isolated tags",
  args: {
    mode: option({
      long: "release-mode",
      short: "m",
      description:
        "Semver release mode to use. NOTE: using prerelease on a production branch is invalid and will throw an error.",
      type: oneOf(modes),
      defaultValue: () => "prerelease" as const,
      defaultValueIsSerializable: true,
    }),
    dryRun: flag({
      long: "dry-run",
      description: "Dry run",
      type: boolean,
      defaultValue: () => false,
      defaultValueIsSerializable: true,
    }),
    verbose: flag({
      long: "verbose",
      description: "Verbose",
      type: boolean,
      defaultValue: () => false,
      defaultValueIsSerializable: true,
    }),
    skipPublish: flag({
      long: "skip-publish",
      description: "Do not run the publish step",
      defaultValue: () => false,
      defaultValueIsSerializable: true,
    }),
    skipChangelog: flag({
      long: "skip-changelog",
      description: "Do not run the changelog step",
      defaultValue: () => false,
      defaultValueIsSerializable: true,
    }),
    skipStage: flag({
      long: "skip-stage",
      description: "Do not run the stage step",
      defaultValue: () => false,
      defaultValueIsSerializable: true,
    }),
    skipCommit: flag({
      long: "skip-commit",
      description: "Do not run the commit step",
      defaultValue: () => false,
      defaultValueIsSerializable: true,
    }),
    skipPush: flag({
      long: "skip-push",
      description: "Do not run the push step",
      defaultValue: () => false,
      defaultValueIsSerializable: true,
    }),
    skipGitTag: flag({
      long: "skip-git-tag",
      description: "Do not set a git tag",
      defaultValue: () => false,
      defaultValueIsSerializable: true,
    }),
  },
  handler: async (args) => {
    console.log(">>> args", { args });

    const {
      mode,
      dryRun,
      verbose,
      skipPublish,
      skipChangelog,
      skipCommit,
      skipPush,
      skipStage,
      skipGitTag,
    } = args;
    const doGitSideEffects = !dryRun;
    const stageChanges = doGitSideEffects && skipStage !== true;
    const gitCommit = stageChanges && skipCommit !== true;
    const gitTag = gitCommit && skipGitTag !== true;
    const gitPush = gitCommit && skipPush !== true;
    const branchName = getBranchName();
    const channel = getReleaseChannelFromBranchName(branchName);
    const specifier = getSpecifier(channel, mode);
    const preid = getPreid(channel);

    console.log(">>> release inputs", {
      branchName,
      channel,
      specifier,
      preid,
    });

    const releaseClient = new ReleaseClient(
      {
        projects: ["packages/*", "clis/*", "apps/*"],
        projectsRelationship: "fixed",
        releaseTag: { pattern: "v{version}" },
        changelog: {
          automaticFromRef: true,
          projectChangelogs: {
            createRelease: "github",
          },
        },
      },
      true,
    );

    const { releaseVersion, releaseChangelog, releasePublish } = releaseClient;

    let workspaceVersion: string | null | undefined;
    let projectsVersionData: Awaited<
      ReturnType<typeof releaseVersion>
    >["projectsVersionData"];
    let releaseGraph: Awaited<
      ReturnType<typeof releaseVersion>
    >["releaseGraph"];

    try {
      const dryRunResult = await releaseVersion({
        specifier,
        preid,
        verbose,
        dryRun: true,
      });
      if (!dryRunResult.workspaceVersion) {
        console.log(">>> No version calculated (likely no changes). Exiting.");
        process.exit(1);
      }
    } catch (error) {
      console.error("Error occurred in release versioning dry run:");
      throw error;
    }

    try {
      const result = await releaseVersion({
        specifier,
        preid,
        verbose,
        dryRun,
        stageChanges: false,
        gitCommit: false,
        gitTag: false,
        gitPush: false,
      });
      workspaceVersion = result.workspaceVersion;
      projectsVersionData = result.projectsVersionData;
      releaseGraph = result.releaseGraph;
    } catch (error) {
      console.error("Error occurred in release versioning:");
      throw error;
    }

    if (!workspaceVersion)
      throw new Error("Expected workspaceVersion after releaseVersion run");

    try {
      const buildResult = runCommandWithBun(["pnpm", "build-cli"], {
        WORKSPACE_VERSION: workspaceVersion,
      });

      if (buildResult.exitCode !== 0) {
        throw new Error(">>> BUILD FAILED");
      }
    } catch (error) {
      console.error("Building clis failed:");
      throw error;
    }

    if (!skipChangelog) {
      try {
        const changeLogDryRunResult = await releaseChangelog({
          version: workspaceVersion,
          versionData: projectsVersionData,
          releaseGraph,
          verbose,
          dryRun: true,
        });
        if (!changeLogDryRunResult.projectChangelogs) {
          throw new Error("No project changelogs were generated in dry run");
        }
      } catch (error) {
        console.error("Error occurred in changelog generation dry run:");
        throw error;
      }

      try {
        const result = await releaseChangelog({
          version: workspaceVersion,
          versionData: projectsVersionData,
          dryRun,
          releaseGraph,
          verbose,
          gitCommit: false,
          stageChanges: false,
          gitPush: false,
          gitTag: false,
        });
        if (!result.projectChangelogs) {
          throw new Error("No project changelogs were generated");
        }
      } catch (error) {
        console.error("Error occurred in changelog generation:");
        throw error;
      }
    }

    if (!skipPublish) {
      try {
        const publishDryRunResult = await releasePublish({
          tag: preid,
          versionData: projectsVersionData,
          releaseGraph,
          verbose,
          dryRun: true,
        });

        for (const [name, { code }] of Object.entries(publishDryRunResult)) {
          if (code !== 0) {
            throw new Error(
              `Dry run release of project "${name}" failed with exit code ${code}`,
            );
          }
        }
      } catch (error) {
        console.error("Error occurred in release dry run:");
        throw error;
      }

      try {
        const publishResult = await releasePublish({
          tag: preid,
          versionData: projectsVersionData,
          releaseGraph,
          verbose,
          dryRun,
        });

        for (const [name, { code }] of Object.entries(publishResult)) {
          if (code !== 0) {
            throw new Error(
              `Release of project "${name}" failed with exit code ${code}`,
            );
          }
        }
      } catch (error) {
        console.error("Failed to publish:");
        throw error;
      }
    }

    let hasStaged = false;
    let didCommit = false;

    if (stageChanges) {
      const stageChangesCmd = [
        "git",
        "add",
        "package.json",
        "CHANGELOG.md",
        ":(glob)**/package.json",
        ":(glob)**/CHANGELOG.md",
      ];
      console.log(
        `Staging files in git with the following command: ${stageChangesCmd.join(" ")}`,
      );
      const result = runCommandWithBun(stageChangesCmd);
      if (result.exitCode !== 0) {
        throw new Error("Failed to stage changes with git");
      }
      console.log("Staged the following files:");
      runCommandWithBun(["git", "diff", "--cached", "--name-only"]);
    }

    hasStaged =
      runCommandWithBun(["git", "diff", "--cached", "--quiet"]).exitCode !== 0;

    if (gitCommit && hasStaged) {
      const commitChangesCmd = [
        "git",
        "commit",
        "--message",
        `chore(release): publish ${workspaceVersion}`,
      ];
      console.log(
        `Committing files in git with the following command: ${commitChangesCmd.join(" ")}`,
      );
      const result = runCommandWithBun(commitChangesCmd);
      if (result.exitCode !== 0) {
        throw new Error("Failed to commit changes with git");
      }
      didCommit = true;
    }

    if (gitTag && didCommit) {
      const commitGitTag = `v${workspaceVersion}`;
      const tagCommitCmd = [
        "git",
        "tag",
        "--annotate",
        commitGitTag,
        "--message",
        commitGitTag,
      ];
      console.log(
        `Tagging the current commit in git with the following command: ${tagCommitCmd.join(" ")}`,
      );
      const result = runCommandWithBun(tagCommitCmd);
      if (result.exitCode !== 0) {
        throw new Error("Failed to tag commit with git");
      }
    }

    if (gitPush && didCommit) {
      const gitPushCommitCmd = [
        "git",
        "push",
        "origin",
        "HEAD",
        "--follow-tags",
      ];
      console.log(
        `Pushing the current commit in git with the following command: ${gitPushCommitCmd.join(" ")}`,
      );
      const result = runCommandWithBun(gitPushCommitCmd);
      if (result.exitCode !== 0) {
        throw new Error("Failed to push commit with git");
      }
    }
    console.log(">>> Release successfully completed 🚀");
    process.exit(0);
  },
});

await run(app, process.argv.slice(2));

function runCommandWithBun(
  cmd: string[],
  env?: Record<string, string | undefined>,
) {
  return Bun.spawnSync({
    cmd,
    stdio: ["inherit", "inherit", "inherit"],
    env: {
      ...process.env,
      ...env,
    },
  });
}
