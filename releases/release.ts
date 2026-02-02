import { boolean, command, flag, oneOf, option, run } from "cmd-ts";
import console from "console";
import { ReleaseClient } from "nx/release";
import type { ReleaseType } from "semver";

const channels = ["dev", "staging", "production"] as const;
type Channel = (typeof channels)[number];
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

function getReleaseTag(channel: Channel) {
  if (channel === "production")
    return {
      pattern: "v{version}",
    };
  return {
    pattern: `v{version}-${channel}.{prerelease}`,
  };
}

function getPreid(channel: Channel): string | undefined {
  if (channel === "production") return "latest";
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
    } = args;
    const stageChanges = skipStage !== true;
    const gitCommit = skipCommit !== true;
    const gitPush = skipPush !== true;
    const branchName = getBranchName();
    const channel = getReleaseChannelFromBranchName(branchName);
    const specifier = getSpecifier(channel, mode);
    const releaseTag = getReleaseTag(channel);
    const preid = getPreid(channel);

    console.log(">>> release inputs", {
      branchName,
      channel,
      specifier,
      releaseTag,
      preid,
    });

    const releaseClient = new ReleaseClient(
      {
        projects: ["packages/*", "clis/*", "apps/*"],
        projectsRelationship: "fixed",
        releaseTag,
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

    const { workspaceVersion, projectsVersionData, releaseGraph } =
      await releaseVersion({
        specifier,
        preid,
        dryRun,
        verbose,
        stageChanges,
        gitCommit,
        gitPush,
      });

    if (!workspaceVersion) {
      console.log(">>> No version calculated (likely no changes). Exiting.");
      process.exit(0);
    }

    const buildResult = Bun.spawnSync({
      cmd: ["pnpm", "build-misc"],
      stdio: ["inherit", "inherit", "inherit"],
      env: {
        ...process.env,
        WORKSPACE_VERSION: workspaceVersion,
      },
    });

    if (buildResult.exitCode !== 0) {
      console.error(">>> BUILD FAILED");
      process.exit(1);
    }

    if (!skipChangelog) {
      await releaseChangelog({
        version: workspaceVersion,
        versionData: projectsVersionData,
        dryRun,
        releaseGraph,
        verbose,
        gitCommit,
        stageChanges,
        gitPush,
      });
    }

    if (!skipPublish) {
      const publishResult = await releasePublish({
        tag: preid,
        versionData: projectsVersionData,
        dryRun,
        verbose,
        releaseGraph,
      });

      const failed = Object.values(publishResult).some((r) => r.code !== 0);
      if (failed) {
        console.error(">>> PUBLISH FAILED");
        console.error(publishResult);
        process.exit(1);
      }
    }

    console.log(">>> Release successfully completed 🚀");
  },
});

await run(app, process.argv.slice(2));
