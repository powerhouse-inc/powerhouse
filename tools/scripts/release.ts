/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-floating-promises */
import { releaseChangelog, releasePublish, releaseVersion } from "nx/release";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";


type ProjectsVersionData = Record<string, { newVersion?: string }>;

const MAX_COMMITS_PER_RELEASE = 200;
const MAX_RELEASE_CONTENTS_LENGTH = 200000;
const FROM = `HEAD~${MAX_COMMITS_PER_RELEASE}`;
const TO = "HEAD";
const branchRegexp = /^release\/[^\/\s]+\/v?\d+\.\d+\.\d+$/;
const validProductionBranches = ['prod', 'production'];

function getVersionFromProjectsVersionData(projectsVersionData: ProjectsVersionData) {
  let version: null | string = null;
  
  for (const [packageName, packageData] of Object.entries(projectsVersionData)) {
    const packageVersion = packageData.newVersion;

    if (!version && packageVersion) {
      version = packageVersion;
    }

    if (version !== null && packageVersion && packageVersion !== version) {
      throw new Error(`Version mismatch for ${packageName}: ${version} !== ${packageVersion}`);
    }
  }

  if (!version) {
    throw new Error('No version found in projectsVersionData');
  }

  return version;
}

async function getPreReleaseResults(specifier?: string, preid?: string) {
  const result = {
    isUsingCurrentVersion: false,
    isChangelogTooLong: false,
    isEmptyRelease: false,
  };
  
  const { workspaceVersion, projectsVersionData } = await releaseVersion({
    specifier,
    preid,
    dryRun: true,
    verbose: false,
  });

  const isUsingCurrentVersion = Object.values(projectsVersionData).some((project) => project.newVersion === project.currentVersion);
  if (isUsingCurrentVersion) {
    console.warn("You're using the current version, no changes will be released");
    result.isUsingCurrentVersion = true;
  }

  const changelogResult = await releaseChangelog({
    version: workspaceVersion || getVersionFromProjectsVersionData(projectsVersionData as ProjectsVersionData),
    versionData: projectsVersionData,
    dryRun: true,
    verbose: false,
    createRelease: false,
  });

  if (changelogResult.workspaceChangelog?.contents.length && changelogResult.workspaceChangelog?.contents.length > MAX_RELEASE_CONTENTS_LENGTH) {
    result.isChangelogTooLong = true;
  }

  result.isEmptyRelease = !!changelogResult
    .workspaceChangelog
    ?.contents
    .includes('This was a version bump only, there were no code changes')

  return result;
}

(async () => {
  const options = yargs(hideBin(process.argv))
    .version(false)
    .option('version', {
      type: "string",
    })
    .option('tag', {
      type: "string",
    })
    .option('dry-run', {
      type: "boolean",
      default: false,
    })
    .option('verbose', {
      type: "boolean",
      default: false,
    })
    .option('skip-publish', {
      type: "boolean",
      default: false,
    })
    .option('publish-only', {
      type: "boolean",
      default: false,
    })
    .option('branch-release', {
      type: "string",
    })
    .parseSync();

  console.log('>>> options', options);
  const { version, tag, dryRun, verbose, skipPublish, publishOnly, branchRelease } = options;
  
  let specifier = version;
  let preid = tag;
  let to: string | undefined = undefined;
  let from: string | undefined = undefined;
  
  const isBranchRelease = branchRelease && branchRelease !== "";

  if (isBranchRelease) {
    if (!branchRegexp.test(branchRelease)) {
      console.error('>>> Invalid branch name', branchRelease);
      process.exit(1);
    }

    const [, branchTag, branchVersion] = branchRelease.split('/');
    const normalizedBranchVersion = branchVersion.replace("v", '');
    
    preid = validProductionBranches.includes(branchTag) ? undefined : branchTag;
    specifier =  preid ? `${normalizedBranchVersion}-${preid}.0` : normalizedBranchVersion;
  }

  const preReleaseResult = await getPreReleaseResults(specifier, preid);

  if (preReleaseResult.isUsingCurrentVersion) {
    console.error('>>> You\'re using the current version, no changes will be released');
    process.exit(1);
  }

  if (preReleaseResult.isEmptyRelease) {
    console.error('>>> There are no available changes to release');
    process.exit(1);
  }

  if (preReleaseResult.isChangelogTooLong) {
    console.warn(`>>> Release changelog is too long, limiting to last ${MAX_COMMITS_PER_RELEASE} commits`);
    to = TO;
    from = FROM;
  }

  if (!publishOnly) {
    const { workspaceVersion, projectsVersionData } = await releaseVersion({
      specifier,
      preid,
      dryRun,
      verbose,
    });
  
    releaseChangelog({
      version: workspaceVersion || getVersionFromProjectsVersionData(projectsVersionData as ProjectsVersionData),
      versionData: projectsVersionData,
      dryRun,
      verbose,
      to,
      from,
    });
  }

  
  if (!skipPublish || publishOnly) {
    const publishResult = await releasePublish({
      tag: preid,
      dryRun,
      verbose,
    });

    if (Object.values(publishResult).some(result => result.code !== 0)) {
      console.error('>>> PUBLISH FAILED');
      console.error('>>> publishResult', publishResult);
      process.exit(1);
    }
  }

  process.exit(0);
})();