/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-floating-promises */
import fs from "fs";
import { releaseChangelog, releasePublish, releaseVersion } from "nx/release";
import semver, { ReleaseType } from "semver";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";


type ProjectsVersionData = Record<string, { newVersion?: string }>;

const MAX_COMMITS_PER_RELEASE = 200;
const MAX_RELEASE_CONTENTS_LENGTH = 200000;
const FROM = `HEAD~${MAX_COMMITS_PER_RELEASE}`;
const TO = "HEAD";
const branchRegexp = /^release\/[^\/\s]+\/v?\d+\.\d+\.\d+$/;
const validProductionBranches = ['prod', 'production'];

type PreReleaseResult = {
  isUsingCurrentVersion: boolean;
  isChangelogTooLong: boolean;
  isEmptyRelease: boolean;
  currentTag: string | undefined;
  isUsingOlderVersion: boolean;
};

// Read connect package.json version
const connectPackageJson = JSON.parse(fs.readFileSync('apps/connect/package.json', 'utf8'));
const connectVersion = connectPackageJson.version;

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

  return version;
}

async function getPreReleaseResults(specifier?: string, preid?: string) {
  const result: PreReleaseResult = {
    isUsingCurrentVersion: false,
    isChangelogTooLong: false,
    isEmptyRelease: false,
    currentTag: undefined,
    isUsingOlderVersion: false,
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

  result.isUsingOlderVersion = Object.values(projectsVersionData).some((project) => {
    if (!project.newVersion) return false;
    return semver.lt(project.newVersion, connectVersion)
  });

  const version = workspaceVersion || getVersionFromProjectsVersionData(projectsVersionData as ProjectsVersionData);

  if (!version) {
    result.isEmptyRelease = true;
    return result;
  }

  const changelogResult = await releaseChangelog({
    version: version,
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


  const matchTag = changelogResult.workspaceChangelog?.releaseVersion.rawVersion.match(/v?\d+\.\d+\.\d+-([a-zA-Z]+)\.\d+/);

  const prefix = matchTag ? matchTag[1] : undefined;
  result.currentTag = prefix;
  
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
  
  /**
   * Handle version and tag combination:
   * 
   * When version is a specific version (x.y.z) and tag is provided:
   *    - Input: version="1.0.0", tag="dev"
   *    - Result: specifier="1.0.0-dev.0"
   */
  if (version && tag && /^\d+\.\d+\.\d+$/.test(version)) {
    specifier = `${version}-${tag}.0`;
  }

  if (version && ['patch', 'minor', 'major'].includes(version) && !tag) {
    const semverObject = semver.parse(connectVersion);
  
    if (semverObject && semverObject.prerelease.length > 0) {
      const currentVersion = `${semverObject.major}.${semverObject.minor}.${semverObject.patch}`;
      const prerelease = semverObject.prerelease[0] as string;
      const newVersion = semver.inc(currentVersion, version as ReleaseType) as string;

      specifier = `${newVersion}-${prerelease}.0`;
      preid = prerelease;
    }
  }
  
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

    if (specifier === connectVersion) {
      specifier = semver.inc(specifier, "prerelease", preid) || undefined;
    }
  }

  const preReleaseResult = await getPreReleaseResults(specifier, preid);

  if (preReleaseResult.isUsingOlderVersion) {
    console.error('>>> The version calculated for the release is older thatn the current version, check that there are no missing tags');
    process.exit(1);
  }

  if (preReleaseResult.isUsingCurrentVersion) {
    console.error('>>> You\'re using the current version, no changes will be released');
    process.exit(1);
  }

  if (preReleaseResult.isEmptyRelease) {
    console.warn('>>> There are no available changes to release');
    process.exit(0);
  }

  if (preReleaseResult.isChangelogTooLong) {
    console.warn(`>>> Release changelog is too long, limiting to last ${MAX_COMMITS_PER_RELEASE} commits`);
    to = TO;
    from = FROM;
  }

  if (!version && !tag) {
    preid = preReleaseResult.currentTag;
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

  console.log('>>> Release successfuly completed 🚀');
  process.exit(0);
})();